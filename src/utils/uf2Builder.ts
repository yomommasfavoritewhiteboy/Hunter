import type { FirmwareConfig } from '../types/techo';
import { generateFirmwareProject } from './firmwareGenerator';

export const UF2_MAGIC_START0 = 0x0a324655; // "UF2\n"
export const UF2_MAGIC_START1 = 0x9e5d5157;
export const UF2_MAGIC_END = 0x0ab16f30;
export const UF2_FLAG_FAMILY_ID_PRESENT = 0x00002000;
export const NRF52840_FAMILY_ID = 0xada52840; // LilyGO T-Echo-Card Adafruit nRF52840 Bootloader (NRF52BOOT)
export const NRF52840_FLASH_PAGE_BYTES = 4096; // 16 UF2 blocks per 4KB flash erase page
export const UF2_BLOCK_SIZE = 512;
export const UF2_PAYLOAD_BYTES = 256;

export type BootloaderOffsetPreset = 's140_v7' | 's140_v6';

export const BOOTLOADER_OFFSETS: Record<BootloaderOffsetPreset, { addr: number; label: string }> = {
  s140_v7: { addr: 0x00027000, label: 'SoftDevice S140 v7.x (0x00027000)' },
  s140_v6: { addr: 0x00026000, label: 'SoftDevice S140 v6.1.1 (0x00026000)' },
};

export const TECHO_APP_FLASH_BASE = BOOTLOADER_OFFSETS.s140_v7.addr;

export interface Uf2BuildSummary {
  bytes: Uint8Array;
  blockCount: number;
  payloadBytes: number;
  flashStartHex: string;
  flashEndHex: string;
  familyIdHex: string;
  firstBlockHexPreview: string;
}

/**
 * Encodes a LilyGO T-Echo-Card firmware configuration into 4KB page-aligned 512-byte
 * Microsoft UF2 blocks targeting the Adafruit nRF52840 bootloader (0xADA52840).
 */
export function buildTechoUf2Image(
  config: FirmwareConfig,
  offsetPreset: BootloaderOffsetPreset = 's140_v7'
): Uf2BuildSummary {
  const flashBase = BOOTLOADER_OFFSETS[offsetPreset].addr;
  const generatedFiles = generateFirmwareProject(config);
  const prefsFile = generatedFiles.find((f) => f.path === 'meshtastic/userPrefs.jsonc');

  const encoder = new TextEncoder();
  const payloadHeader = encoder.encode(
    `ECHOMESH_TECHO_CARD_NRF52840\0REV=${config.revision}\0SHORT=${config.shortName}\0FREQ=${config.radioConfig.frequencyMhz.toFixed(3)}\0SLOT=${config.radioConfig.frequencySlot}\0DUAL=${config.radioConfig.dualStack.enabled ? 1 : 0}\0`
  );
  const configBytes = encoder.encode(prefsFile?.content ?? '{}');

  // Construct a valid 192-byte ARM Cortex-M4 vector table (48 vectors) + Thumb-2 WFE idle loop at offset 0xC0
  const vectorAndCodeSize = 200;
  const vectorPrefix = new Uint8Array(vectorAndCodeSize);
  const vecView = new DataView(vectorPrefix.buffer);
  const resetHandlerAddr = flashBase + 0xc1; // Thumb bit set (+1) pointing to 0xC0
  vecView.setUint32(0, 0x20040000, true); // Initial MSP (256KB SRAM top on nRF52840)
  for (let v = 1; v < 48; v++) {
    vecView.setUint32(v * 4, resetHandlerAddr, true);
  }
  // Valid ARM Thumb-2 instructions at offset 0xC0: WFE (0xBF20), B.N -4 (0xE7FD)
  vecView.setUint16(0xc0, 0xbf20, true);
  vecView.setUint16(0xc2, 0xe7fd, true);

  const rawLen = vectorPrefix.length + payloadHeader.length + configBytes.length;
  // Pad strictly to 4KB (4096-byte) nRF52840 flash erase pages so the UF2 bootloader never rejects unaligned trailing pages
  const paddedLen = Math.ceil(rawLen / NRF52840_FLASH_PAGE_BYTES) * NRF52840_FLASH_PAGE_BYTES;
  const programBytes = new Uint8Array(paddedLen);
  programBytes.fill(0xff); // Erased NOR flash default
  programBytes.set(vectorPrefix, 0);
  programBytes.set(payloadHeader, vectorPrefix.length);
  programBytes.set(configBytes, vectorPrefix.length + payloadHeader.length);

  const blockCount = paddedLen / UF2_PAYLOAD_BYTES;
  const uf2Bytes = new Uint8Array(blockCount * UF2_BLOCK_SIZE);

  for (let blockNo = 0; blockNo < blockCount; blockNo++) {
    const blockOffset = blockNo * UF2_BLOCK_SIZE;
    const view = new DataView(uf2Bytes.buffer, blockOffset, UF2_BLOCK_SIZE);

    view.setUint32(0, UF2_MAGIC_START0, true);
    view.setUint32(4, UF2_MAGIC_START1, true);
    view.setUint32(8, UF2_FLAG_FAMILY_ID_PRESENT, true);
    view.setUint32(12, flashBase + blockNo * UF2_PAYLOAD_BYTES, true);
    view.setUint32(16, UF2_PAYLOAD_BYTES, true);
    view.setUint32(20, blockNo, true);
    view.setUint32(24, blockCount, true);
    view.setUint32(28, NRF52840_FAMILY_ID, true);

    const chunkStart = blockNo * UF2_PAYLOAD_BYTES;
    const chunk = programBytes.subarray(chunkStart, chunkStart + UF2_PAYLOAD_BYTES);
    uf2Bytes.set(chunk, blockOffset + 32);

    view.setUint32(508, UF2_MAGIC_END, true);
  }

  const firstBlockHexPreview = Array.from(uf2Bytes.subarray(0, 32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  return {
    bytes: uf2Bytes,
    blockCount,
    payloadBytes: paddedLen,
    flashStartHex: `0x${flashBase.toString(16).toUpperCase().padStart(8, '0')}`,
    flashEndHex: `0x${(flashBase + paddedLen).toString(16).toUpperCase().padStart(8, '0')}`,
    familyIdHex: `0x${NRF52840_FAMILY_ID.toString(16).toUpperCase()}`,
    firstBlockHexPreview,
  };
}
