import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { AlertTriangle, Check, Copy, Cpu, Download, FileCode2, Terminal } from 'lucide-react';
import type { FirmwareConfig } from '../types/techo';
import { generateFirmwareProject } from '../utils/firmwareGenerator';
import {
  BOOTLOADER_OFFSETS,
  buildTechoUf2Image,
  type BootloaderOffsetPreset,
} from '../utils/uf2Builder';

interface FirmwareWorkbenchProps {
  config: FirmwareConfig;
}

export const FirmwareWorkbench: React.FC<FirmwareWorkbenchProps> = ({ config }) => {
  const [offsetPreset, setOffsetPreset] = useState<BootloaderOffsetPreset>('s140_v7');
  const appStartHex = `0x${BOOTLOADER_OFFSETS[offsetPreset].addr.toString(16).toUpperCase().padStart(8, '0')}`;
  const files = useMemo(() => generateFirmwareProject(config, appStartHex), [config, appStartHex]);
  const uf2Build = useMemo(() => buildTechoUf2Image(config, offsetPreset), [config, offsetPreset]);
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path ?? 'src/PowerManager.cpp');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const activeFile = files.find((f) => f.path === selectedPath) ?? files[0];
  const yamlFile = files.find((f) => f.path === 'meshtastic/techo-card-config.yaml');

  const handleCopy = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadYaml = () => {
    if (!yamlFile) return;
    const blob = new Blob([yamlFile.content], { type: 'text/yaml' });
    triggerBlobDownload(
      blob,
      `${config.shortName.toLowerCase()}-t-echo-card-rev${config.revision}.yaml`
    );
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      for (const file of files) {
        zip.file(file.path, file.content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(
        blob,
        `${config.shortName.toLowerCase()}-t-echo-card-platformio-rev${config.revision}.zip`
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#E6ECF5]">
              LilyGO T-Echo-Card Firmware &amp; .UF2 Build Bundle
            </h2>
            <p className="text-xs text-[#8E9BB3]">
              Target: LilyGO T-Echo-Card (nRF52840 · AcSiP S62F SX1262 · L76K · 0.42&quot; U8g2 OLED · ICM20948) · Rev {config.revision}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bootloader-offset" className="sr-only">
              SoftDevice Flash Offset
            </label>
            <select
              id="bootloader-offset"
              value={offsetPreset}
              onChange={(e) => setOffsetPreset(e.target.value as BootloaderOffsetPreset)}
              className="bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] text-xs rounded-lg px-2.5 py-2"
            >
              <option value="s140_v7">{BOOTLOADER_OFFSETS.s140_v7.label}</option>
              <option value="s140_v6">{BOOTLOADER_OFFSETS.s140_v6.label}</option>
            </select>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={downloading}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#090C12] rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Packaging...' : 'Download PlatformIO ZIP'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadYaml}
              className="px-3.5 py-2 text-xs font-medium bg-[#182030] hover:bg-[#232F46] text-[#E6ECF5] border border-[#2B374E] rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Meshtastic .YAML</span>
            </button>
          </div>
        </div>

        {/* Honest Hardware Compilation & Working Flash Paths */}
        <div className="bg-amber-500/8 border border-amber-500/35 rounded-lg p-3.5 text-xs space-y-2">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Why Browser-Exported .UF2 Stubs Do Not Boot Hardware &amp; How to Flash Real Firmware</span>
          </div>
          <p className="text-[#C8D3E6] leading-relaxed">
            A web browser cannot run <code className="text-[#E6ECF5]">arm-none-eabi-gcc</code> to compile C++ (<code className="text-[#E6ECF5]">RadioLib</code>, <code className="text-[#E6ECF5]">U8g2</code>, <code className="text-[#E6ECF5]">Bluefruit</code>) into executable ARM Cortex-M4 machine code. To run working firmware on your physical <strong className="text-[#E6ECF5]">T-Echo-Card</strong>:
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
            <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3 space-y-1">
              <div className="font-semibold text-[#E6ECF5]">
                Path A — Official Meshtastic .UF2 + EchoMesh Config (Fastest)
              </div>
              <p className="text-[#9AA7BD] leading-relaxed">
                1. Double-tap Reset on your T-Echo-Card to mount <code className="text-[#E6ECF5]">NRF52BOOT</code>, then flash the official <code className="text-cyan-300">firmware-t-echo-card-*.uf2</code> from <span className="text-[#E6ECF5]">flasher.meshtastic.org</span>.
                <br />
                2. Click <strong className="text-[#E6ECF5]">Meshtastic .YAML</strong> above and apply Asheville Slot 20, power, and BLE settings via USB:
                <code className="block mt-1 text-cyan-300 font-mono">meshtastic --configure *.yaml</code>
              </p>
            </div>
            <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3 space-y-1">
              <div className="font-semibold text-[#E6ECF5]">
                Path B — Compile Custom Dual-Stack .UF2 Locally (PlatformIO)
              </div>
              <p className="text-[#9AA7BD] leading-relaxed">
                1. Click <strong className="text-[#E6ECF5]">Download PlatformIO ZIP</strong> (includes <code className="text-[#E6ECF5]">U8G2_SSD1306_72X40</code> OLED, SX1262 <code className="text-[#E6ECF5]">RF_VC1/VC2</code> + 3.0V TCXO, and Meshtastic+MeshCore TDM).
                <br />
                2. Unzip and run <code className="text-cyan-300 font-mono">pio run</code> — outputs <code className="text-[#E6ECF5]">.pio/build/lilygo_techo_card/firmware.uf2</code>. Copy via <code className="text-cyan-300 font-mono">cp -X firmware.uf2 /Volumes/NRF52BOOT/</code> on macOS.
              </p>
            </div>
          </div>
        </div>

        {/* UF2 Bootloader Target Reference Strip */}
        <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3.5 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
          <div>
            <div className="text-[11px] text-[#8E9BB3] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bootloader Family</span>
            </div>
            <div className="mt-0.5 text-[#E6ECF5] font-semibold">
              {uf2Build.familyIdHex} (NRF52BOOT)
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#8E9BB3]">App Flash Base</div>
            <div className="mt-0.5 text-[#E6ECF5] font-semibold">
              {uf2Build.flashStartHex}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#8E9BB3]">OLED &amp; LoRa Fix</div>
            <div className="mt-0.5 text-amber-300 font-semibold">
              U8g2 72×40 · S62F TCXO
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#8E9BB3] flex items-center gap-1">
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Output UF2 Path</span>
            </div>
            <div className="mt-0.5 text-[#9AA7BD] truncate">.pio/build/lilygo_techo_card/firmware.uf2</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* File Explorer */}
        <aside className="lg:col-span-4 bg-[#10151F] border border-[#222C3E] rounded-xl p-3 space-y-1">
          <div className="px-2 py-1.5 text-xs font-medium text-[#8E9BB3]">
            Generated Firmware Files ({files.length})
          </div>
          {files.map((file) => {
            const active = file.path === activeFile?.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#172133] border border-cyan-500/40 text-[#E6ECF5]'
                    : 'text-[#A9B7D0] hover:bg-[#141B29] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-medium">
                  <FileCode2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{file.path}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-[#8E9BB3] line-clamp-1 pl-5">{file.summary}</p>
              </button>
            );
          })}
        </aside>

        {/* Source Code Inspector */}
        <section className="lg:col-span-8 bg-[#10151F] border border-[#222C3E] rounded-xl overflow-hidden">
          {activeFile && (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#222C3E] bg-[#0D121B]">
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold text-[#E6ECF5] truncate">
                    {activeFile.path}
                  </div>
                  <div className="text-[11px] text-[#8E9BB3] truncate">{activeFile.summary}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-xs font-medium bg-[#182030] hover:bg-[#232F46] text-[#E6ECF5] border border-[#2B374E] rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy File'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono leading-relaxed text-[#D7E0F0] overflow-x-auto max-h-[560px] overflow-y-auto">
                <code>{activeFile.content}</code>
              </pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
