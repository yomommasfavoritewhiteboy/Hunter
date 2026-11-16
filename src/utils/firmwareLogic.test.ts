import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultFirmwareConfig } from './defaultConfig';
import { computeAdaptivePowerSchedule, applyPowerPreset } from './powerEngine';
import { parseRtttl, compileRtttlToCpp } from './rtttl';
import {
  encryptMeshtasticPayload,
  decryptMeshtasticPayload,
  validatePskBase64,
  generatePsk256,
} from './cryptoMesh';
import {
  computeUs915SlotFrequencyMhz,
  selectBestLocalChannel,
  applyAshevilleAutoChannel,
} from './regionalChannel';
import { generateFirmwareProject } from './firmwareGenerator';
import {
  buildTechoUf2Image,
  NRF52840_FAMILY_ID,
  TECHO_APP_FLASH_BASE,
  UF2_BLOCK_SIZE,
  UF2_MAGIC_END,
  UF2_MAGIC_START0,
  UF2_MAGIC_START1,
} from './uf2Builder';

test('adaptive power engine scales GPS, BLE, and E-Ink intervals across battery & activity states', () => {
  const cfg = createDefaultFirmwareConfig();
  const activeHigh = computeAdaptivePowerSchedule(85, 'trail', 'balanced', cfg.powerPolicy, cfg.radioConfig, true);
  const stationaryLow = computeAdaptivePowerSchedule(18, 'stationary', 'balanced', cfg.powerPolicy, cfg.radioConfig, true);
  const criticalBatt = computeAdaptivePowerSchedule(8, 'walking', 'balanced', cfg.powerPolicy, cfg.radioConfig, true);
  const sosOverride = computeAdaptivePowerSchedule(8, 'sos', 'balanced', cfg.powerPolicy, cfg.radioConfig, true);

  assert.ok(stationaryLow.gpsIntervalSec > activeHigh.gpsIntervalSec);
  assert.ok(stationaryLow.bleIntervalMs > activeHigh.bleIntervalMs);
  assert.ok(stationaryLow.einkRefreshSec > activeHigh.einkRefreshSec);
  assert.equal(criticalBatt.tier, 'survival');
  assert.ok(criticalBatt.loraTxDbm <= 14);
  assert.equal(sosOverride.tier, 'sos-override');
  assert.equal(sosOverride.gpsIntervalSec, 5);
  assert.equal(sosOverride.loraTxDbm, 22);
});

test('expedition preset yields longer estimated runtime than performance preset', () => {
  const cfg = createDefaultFirmwareConfig();
  const exp = computeAdaptivePowerSchedule(75, 'walking', 'expedition', applyPowerPreset('expedition'), cfg.radioConfig, true);
  const perf = computeAdaptivePowerSchedule(75, 'walking', 'performance', applyPowerPreset('performance'), cfg.radioConfig, true);
  assert.ok(exp.estimatedHoursRemaining > perf.estimatedHoursRemaining);
  assert.ok(exp.savingsPct > 40);
});

test('Asheville regional optimizer resolves US915 Slot 20 (906.875 MHz) and Pisgah backcountry fallback', () => {
  assert.equal(computeUs915SlotFrequencyMhz(20), 906.875);
  const downtown = selectBestLocalChannel(35.5951, -82.5515, false);
  assert.equal(downtown.frequencySlot, 20);
  assert.equal(downtown.frequencyMhz, 906.875);

  const backcountry = selectBestLocalChannel(35.5951, -82.5515, true);
  assert.equal(backcountry.frequencySlot, 9);
  assert.equal(backcountry.modemPreset, 'VERY_LONG_SLOW');

  const cfg = createDefaultFirmwareConfig();
  const applied = applyAshevilleAutoChannel(cfg.radioConfig, 35.5951, -82.5515, true);
  assert.equal(applied.radioConfig.frequencySlot, 9);
  assert.equal(applied.radioConfig.autoLocalChannel, true);
});

test('RTTTL parser validates notes and compiles C++ ToneStep entries', () => {
  const parsed = parseRtttl('TacPing:d=16,o=6,b=160:c,e,g,c7,p,g,c7');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.notes.length, 7);
  assert.ok(parsed.totalDurationMs > 300);

  const cpp = compileRtttlToCpp('TacPing:d=16,o=6,b=160:c,e,g');
  assert.ok(cpp.includes('C6'));
  assert.ok(cpp.includes('E6'));

  const bad = parseRtttl('BrokenRingtone');
  assert.equal(bad.valid, false);
  assert.ok(bad.error);
});

test('AES-256 PSK generation, validation, and CTR payload encryption round-trip', () => {
  const psk = generatePsk256();
  const check = validatePskBase64(psk);
  assert.equal(check.valid, true);
  assert.equal(check.bits, 256);

  const secret = 'Asheville Ridge Check-in @ 35.5951,-82.5515';
  const hex = encryptMeshtasticPayload(secret, psk, 99123);
  const plain = decryptMeshtasticPayload(hex, psk);
  assert.equal(plain, secret);
});

test('firmware project generator includes T-Echo-Card pinout, U8g2 72x40 OLED, RF switch, and Meshtastic + MeshCore dual-stack', () => {
  const cfg = createDefaultFirmwareConfig();
  const files = generateFirmwareProject(cfg);
  assert.equal(files.length, 13);
  const ini = files.find((f) => f.path === 'platformio.ini');
  const pins = files.find((f) => f.path === 'include/t_echo_card_config.h');
  const oled = files.find((f) => f.path === 'src/DashboardOLED.cpp');
  const dual = files.find((f) => f.path === 'src/DualStackRadio.cpp');
  const mainCpp = files.find((f) => f.path === 'src/main.cpp');
  assert.ok(ini?.content.includes('[env:lilygo_techo_card]'));
  assert.ok(ini?.content.includes('board = nrf52840_dk'));
  assert.ok(ini?.content.includes('LORA_CHANNEL_SLOT=20'));
  assert.ok(ini?.content.includes('906.875f'));
  assert.ok(pins?.content.includes('#define LORA_CS         11'));
  assert.ok(pins?.content.includes('#define RF_VC1'));
  assert.ok(pins?.content.includes('#define RF_VC2'));
  assert.ok(pins?.content.includes('#define OLED_WIDTH      72'));
  assert.ok(oled?.content.includes('U8G2_SSD1306_72X40_ER_F_HW_I2C'));
  assert.ok(dual?.content.includes('setRfSwitchPins(RF_VC1, RF_VC2)'));
  assert.ok(dual?.content.includes('MESHTASTIC_SYNC     = 0x2B'));
  assert.ok(dual?.content.includes('MESHCORE_SYNC       = 0x12'));
  assert.ok(mainCpp?.content.includes('renderModularOledDashboard'));
});

test('UF2 builder emits 4KB-page-aligned 512-byte nRF52840 bootloader blocks for LilyGO T-Echo-Card', () => {
  const cfg = createDefaultFirmwareConfig();
  const uf2 = buildTechoUf2Image(cfg, 's140_v7');
  assert.ok(uf2.blockCount >= 16);
  assert.equal(uf2.blockCount % 16, 0);
  assert.equal(uf2.bytes.length, uf2.blockCount * UF2_BLOCK_SIZE);

  for (let i = 0; i < uf2.blockCount; i++) {
    const dv = new DataView(uf2.bytes.buffer, i * UF2_BLOCK_SIZE, UF2_BLOCK_SIZE);
    assert.equal(dv.getUint32(0, true), UF2_MAGIC_START0);
    assert.equal(dv.getUint32(4, true), UF2_MAGIC_START1);
    assert.equal(dv.getUint32(12, true), TECHO_APP_FLASH_BASE + i * 256);
    assert.equal(dv.getUint32(20, true), i);
    assert.equal(dv.getUint32(24, true), uf2.blockCount);
    assert.equal(dv.getUint32(28, true), NRF52840_FAMILY_ID);
    assert.equal(dv.getUint32(508, true), UF2_MAGIC_END);
  }
});
