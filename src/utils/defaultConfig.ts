import type { FirmwareConfig, MeshMessage, SyncedDevice } from '../types/techo';
import { encryptMeshtasticPayload } from './cryptoMesh';
import { applyPowerPreset } from './powerEngine';
import { ASHEVILLE_CHANNEL_CANDIDATES } from './regionalChannel';
import { RINGTONE_PRESETS } from './rtttl';

const DEFAULT_CHANNEL_PSK_PRIMARY = '2vN8kP4rT9xZ3mQ7wL1cV6bN0yH5jK8sF2dG4pW9zX0=';
const DEFAULT_CHANNEL_PSK_SAR = 'k8M2pL9qR4vT7xZ1nB6cF3hJ5dS0wE8yU2aP4oI7lK9=';

export function createDefaultFirmwareConfig(): FirmwareConfig {
  const avlPrimary = ASHEVILLE_CHANNEL_CANDIDATES[0];
  return {
    id: 'techo-avl-primary',
    deviceName: 'AVL Echo Card Alpha',
    shortName: 'AVLA',
    powerMode: 'balanced',
    powerPolicy: applyPowerPreset('balanced'),
    radioConfig: {
      region: 'US',
      modemPreset: avlPrimary.modemPreset,
      frequencySlot: avlPrimary.frequencySlot,
      frequencyMhz: avlPrimary.frequencyMhz,
      autoLocalChannel: true,
      localAreaLabel: avlPrimary.area,
      hopLimit: avlPrimary.hopLimit,
      txPowerDbm: avlPrimary.recommendedTxDbm,
      gpsEnabled: true,
      smartPositionEnabled: true,
      bme280Enabled: true,
      dualStack: {
        enabled: true,
        meshtasticSharePct: 60,
        meshcoreRole: 'companion',
        meshcoreFreqMhz: 910.525,
        meshcoreSyncWord: '0x12',
        crossBridgeEnabled: true,
      },
    },
    bleConfig: {
      enabled: true,
      pinCode: '482910',
      pairingMode: 'FIXED_PIN',
      lowPowerAdv: true,
      mtuSize: 512,
    },
    ringtoneConfig: {
      activePresetId: RINGTONE_PRESETS[0].id,
      customRtttl: RINGTONE_PRESETS[0].rtttl,
      volumePct: 80,
      vibratePattern: 'double',
      quietHoursEnabled: true,
      quietStartHour: 23,
      quietEndHour: 6,
    },
    dashboardLayout: [
      {
        id: 'gps_nav',
        title: 'GNSS Position & Elevation',
        subtitle: 'L76K Fix · Asheville Basin',
        enabled: true,
        size: 'expanded',
        order: 0,
        refreshRateSec: 15,
        showOnEInk: true,
      },
      {
        id: 'power_telemetry',
        title: 'Adaptive Battery & Solar',
        subtitle: 'nRF52840 + 0.25W Solar Policy',
        enabled: true,
        size: 'expanded',
        order: 1,
        refreshRateSec: 10,
        showOnEInk: true,
      },
      {
        id: 'env_bme280',
        title: 'ICM20948 9-Axis IMU & Solar',
        subtitle: 'Compass · Motion · Solar Panel',
        enabled: true,
        size: 'compact',
        order: 2,
        refreshRateSec: 30,
        showOnEInk: true,
      },
      {
        id: 'lora_mesh',
        title: 'SX1262 Local Mesh RF',
        subtitle: '906.875 MHz · Slot 20',
        enabled: true,
        size: 'compact',
        order: 3,
        refreshRateSec: 15,
        showOnEInk: true,
      },
      {
        id: 'crypto_inbox',
        title: 'Encrypted Channel Feed',
        subtitle: 'AES-256-CTR Packet Log',
        enabled: true,
        size: 'compact',
        order: 4,
        refreshRateSec: 5,
        showOnEInk: false,
      },
      {
        id: 'ble_link',
        title: 'BLE 5.0 Mobile Bridge',
        subtitle: 'GATT Sync Link',
        enabled: true,
        size: 'compact',
        order: 5,
        refreshRateSec: 15,
        showOnEInk: false,
      },
    ],
    channels: [
      {
        index: 0,
        name: 'AVL-LongFast',
        pskBase64: DEFAULT_CHANNEL_PSK_PRIMARY,
        encryption: 'AES-256-CTR',
        uplinkEnabled: true,
        downlinkEnabled: true,
      },
      {
        index: 1,
        name: 'WNC-Trail-Ops',
        pskBase64: DEFAULT_CHANNEL_PSK_SAR,
        encryption: 'AES-256-CTR',
        uplinkEnabled: false,
        downlinkEnabled: true,
      },
    ],
    lastSyncedDevice: 'Pixel 9 Field App',
    revision: 1,
    updatedAtIso: new Date().toISOString(),
  };
}

export function createInitialMessages(config: FirmwareConfig): MeshMessage[] {
  const ch0 = config.channels[0];
  const ch1 = config.channels[1] ?? ch0;
  const now = Date.now();
  const sample1 = 'Mt. Pisgah repeater nominal: SNR +10.2 dB, solar 13.4V.';
  const sample2 = 'Blue Ridge Pkwy MP 408 trail check-in. Fog clearing at 1520m.';
  const sample3 = 'Craggy Dome node synced Slot 20 (906.875 MHz) relay queue.';

  return [
    {
      id: 'msg-avl-1',
      channelIndex: 0,
      senderShort: 'PISG',
      plaintext: sample1,
      ciphertextHex: encryptMeshtasticPayload(sample1, ch0.pskBase64, 10041),
      hopLimit: 4,
      snrDb: 10.2,
      createdAtIso: new Date(now - 240_000).toISOString(),
    },
    {
      id: 'msg-avl-2',
      channelIndex: ch1.index,
      senderShort: 'BRPK',
      plaintext: sample2,
      ciphertextHex: encryptMeshtasticPayload(sample2, ch1.pskBase64, 10042),
      hopLimit: 3,
      snrDb: 6.4,
      createdAtIso: new Date(now - 110_000).toISOString(),
    },
    {
      id: 'msg-avl-3',
      channelIndex: 0,
      senderShort: 'CRAG',
      plaintext: sample3,
      ciphertextHex: encryptMeshtasticPayload(sample3, ch0.pskBase64, 10043),
      hopLimit: 4,
      snrDb: 3.1,
      createdAtIso: new Date(now - 35_000).toISOString(),
    },
  ];
}

export const DEFAULT_SYNCED_DEVICES: SyncedDevice[] = [
  {
    id: 'dev-workstation',
    label: 'Field Workbench Web',
    platform: 'desktop',
    activeConfigId: 'techo-avl-primary',
    lastSeenIso: new Date().toISOString(),
  },
  {
    id: 'dev-mobile-android',
    label: 'Pixel 9 Companion',
    platform: 'android',
    activeConfigId: 'techo-avl-primary',
    lastSeenIso: new Date(Date.now() - 45_000).toISOString(),
  },
  {
    id: 'dev-techo-card',
    label: 'LilyGO T-Echo Card (AVL-01)',
    platform: 'techo-usb',
    activeConfigId: 'techo-avl-primary',
    lastSeenIso: new Date(Date.now() - 12_000).toISOString(),
  },
];
