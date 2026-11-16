import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { FirmwareConfig, SyncedDevice, VibratePattern } from '../types/techo';
import { generatePsk256, validatePskBase64 } from '../utils/cryptoMesh';
import { parseRtttl, RINGTONE_PRESETS } from '../utils/rtttl';

interface MobileSyncConsoleProps {
  config: FirmwareConfig;
  devices: SyncedDevice[];
  user: User | null;
  syncStatus: string;
  syncError: string | null;
  onUpdateConfig: (updater: (prev: FirmwareConfig) => FirmwareConfig) => void;
  onTestRingtone: () => void;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onForceSync: () => void;
  onAddDevice: (label: string, platform: SyncedDevice['platform']) => void;
  onRemoveDevice: (id: string) => void;
}

type MobileTab = 'modules' | 'ringtones' | 'crypto';

export const MobileSyncConsole: React.FC<MobileSyncConsoleProps> = ({
  config,
  devices,
  user,
  syncStatus,
  syncError,
  onUpdateConfig,
  onTestRingtone,
  onSignInGoogle,
  onSignOut,
  onForceSync,
  onAddDevice,
  onRemoveDevice,
}) => {
  const [mobileTab, setMobileTab] = useState<MobileTab>('modules');
  const [newDeviceLabel, setNewDeviceLabel] = useState('');
  const [newDevicePlatform, setNewDevicePlatform] = useState<SyncedDevice['platform']>('ios');

  const sortedModules = [...config.dashboardLayout].sort((a, b) => a.order - b.order);
  const parsedRtttl = parseRtttl(config.ringtoneConfig.customRtttl);

  const moveModule = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= sortedModules.length) return;
    const reordered = [...sortedModules];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, item);
    const normalized = reordered.map((m, i) => ({ ...m, order: i }));
    onUpdateConfig((prev) => ({
      ...prev,
      lastSyncedDevice: 'Mobile Companion App',
      dashboardLayout: normalized,
    }));
  };

  const toggleModuleField = (
    id: string,
    field: 'enabled' | 'showOnEInk' | 'size',
    val: boolean | 'compact' | 'expanded'
  ) => {
    onUpdateConfig((prev) => ({
      ...prev,
      lastSyncedDevice: 'Mobile Companion App',
      dashboardLayout: prev.dashboardLayout.map((m) =>
        m.id === id ? { ...m, [field]: val } : m
      ),
    }));
  };

  const handleAddChannel = () => {
    if (config.channels.length >= 8) return;
    const nextIdx = config.channels.length;
    onUpdateConfig((prev) => ({
      ...prev,
      lastSyncedDevice: 'Mobile Companion App',
      channels: [
        ...prev.channels,
        {
          index: nextIdx,
          name: `Field-CH${nextIdx}`,
          pskBase64: generatePsk256(),
          encryption: 'AES-256-CTR',
          uplinkEnabled: false,
          downlinkEnabled: true,
        },
      ],
    }));
  };

  const handlePairDevice = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newDeviceLabel.trim();
    if (!label) return;
    onAddDevice(label, newDevicePlatform);
    setNewDeviceLabel('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Realistic Mobile Companion App Settings Frame */}
      <section className="lg:col-span-6 flex justify-center">
        <div className="w-full max-w-[400px] bg-[#0B0F17] border-2 border-[#2A354A] rounded-[28px] p-4 space-y-4 shadow-sm">
          {/* Phone Top Bar */}
          <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1D2638]">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-[#E6ECF5]">EchoMesh Companion</span>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[#8E9BB3]">
              BLE {config.bleConfig.enabled ? `${config.bleConfig.pinCode}` : 'Off'}
            </span>
          </div>

          {/* Mobile Segmented Settings Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#121824] p-1 rounded-xl border border-[#222C3E]">
            {[
              { id: 'modules' as MobileTab, label: 'Modules' },
              { id: 'ringtones' as MobileTab, label: 'Ringtones' },
              { id: 'crypto' as MobileTab, label: 'AES Keys' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={`py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  mobileTab === tab.id
                    ? 'bg-cyan-500 text-[#090C12]'
                    : 'text-[#9AA7BD] hover:text-[#E6ECF5]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile Tab 1: Modular Dashboard Customizer */}
          {mobileTab === 'modules' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[#8E9BB3] px-1">
                <span>Drag-free order &amp; OLED sync</span>
                <span className="font-mono tabular-nums">
                  {sortedModules.filter((m) => m.enabled).length}/{sortedModules.length} active
                </span>
              </div>

              {sortedModules.map((mod, idx) => (
                <div
                  key={mod.id}
                  className="bg-[#121824] border border-[#222C3E] rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-[#E6ECF5] cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={mod.enabled}
                        onChange={(e) => toggleModuleField(mod.id, 'enabled', e.target.checked)}
                        className="accent-cyan-400 rounded shrink-0"
                      />
                      <span className="truncate">{mod.title}</span>
                    </label>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveModule(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move ${mod.title} up`}
                        className="p-1.5 rounded bg-[#182030] text-[#A9B7D0] disabled:opacity-30 hover:text-white cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModule(idx, 1)}
                        disabled={idx === sortedModules.length - 1}
                        aria-label={`Move ${mod.title} down`}
                        className="p-1.5 rounded bg-[#182030] text-[#A9B7D0] disabled:opacity-30 hover:text-white cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#8E9BB3] pl-5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mod.showOnEInk}
                        onChange={(e) => toggleModuleField(mod.id, 'showOnEInk', e.target.checked)}
                        className="accent-amber-400 rounded"
                      />
                      <span>Show on T-Echo-Card OLED</span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        toggleModuleField(
                          mod.id,
                          'size',
                          mod.size === 'expanded' ? 'compact' : 'expanded'
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#182030] text-[#C8D3E6] hover:text-white font-mono cursor-pointer"
                    >
                      {mod.size}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mobile Tab 2: Custom Notification Ringtones */}
          {mobileTab === 'ringtones' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[#A9B7D0]">Notification Ringtone Preset</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {RINGTONE_PRESETS.map((preset) => {
                    const active = config.ringtoneConfig.activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            lastSyncedDevice: 'Mobile Companion App',
                            ringtoneConfig: {
                              ...prev.ringtoneConfig,
                              activePresetId: preset.id,
                              customRtttl: preset.rtttl,
                            },
                          }))
                        }
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer ${
                          active
                            ? 'bg-[#162233] border-amber-500/60 text-[#E6ECF5]'
                            : 'bg-[#121824] border-[#222C3E] text-[#A9B7D0]'
                        }`}
                      >
                        <span className="font-medium">{preset.name}</span>
                        <span className="text-[11px] text-[#8E9BB3]">{preset.category}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block space-y-1 text-xs">
                <span className="text-[#A9B7D0]">Custom RTTTL Melody</span>
                <textarea
                  rows={2}
                  value={config.ringtoneConfig.customRtttl}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      lastSyncedDevice: 'Mobile Companion App',
                      ringtoneConfig: {
                        ...prev.ringtoneConfig,
                        activePresetId: 'custom',
                        customRtttl: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-[#121824] border border-[#253147] text-[#E6ECF5] font-mono text-[11px] rounded-lg p-2.5 focus:outline-none focus:border-amber-400"
                />
              </label>

              {!parsedRtttl.valid ? (
                <p className="text-[11px] text-rose-400">{parsedRtttl.error}</p>
              ) : (
                <p className="text-[11px] font-mono tabular-nums text-[#8E9BB3]">
                  Valid RTTTL · {parsedRtttl.notes.length} notes · {parsedRtttl.totalDurationMs} ms · {parsedRtttl.bpm} BPM
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="flex justify-between text-[#A9B7D0]">
                    <span>I2S Speaker Volume</span>
                    <span className="font-mono tabular-nums">{config.ringtoneConfig.volumePct}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={config.ringtoneConfig.volumePct}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        ringtoneConfig: {
                          ...prev.ringtoneConfig,
                          volumePct: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#A9B7D0] block">Haptic Pattern</span>
                  <select
                    value={config.ringtoneConfig.vibratePattern}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        ringtoneConfig: {
                          ...prev.ringtoneConfig,
                          vibratePattern: e.target.value as VibratePattern,
                        },
                      }))
                    }
                    className="w-full bg-[#121824] border border-[#253147] text-[#E6ECF5] rounded-lg px-2 py-1.5"
                  >
                    <option value="pulse">Single Pulse</option>
                    <option value="double">Double Tap</option>
                    <option value="sos">SOS Cadence</option>
                    <option value="off">Silent</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={onTestRingtone}
                disabled={!parsedRtttl.valid}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#090C12] font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>Play I2S Audio Ringtone Preview</span>
              </button>
            </div>
          )}

          {/* Mobile Tab 3: Encrypted AES-256 Channel Keys */}
          {mobileTab === 'crypto' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A9B7D0]">AES-CTR Channel Keys ({config.channels.length}/8)</span>
                <button
                  type="button"
                  onClick={handleAddChannel}
                  disabled={config.channels.length >= 8}
                  className="px-2.5 py-1 bg-[#182030] hover:bg-[#222D42] text-cyan-300 rounded-md flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Channel</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {config.channels.map((ch) => {
                  const pskCheck = validatePskBase64(ch.pskBase64);
                  return (
                    <div
                      key={ch.index}
                      className="bg-[#121824] border border-[#222C3E] rounded-xl p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          maxLength={16}
                          aria-label={`Channel ${ch.index} name`}
                          value={ch.name}
                          onChange={(e) =>
                            onUpdateConfig((prev) => ({
                              ...prev,
                              channels: prev.channels.map((c) =>
                                c.index === ch.index ? { ...c, name: e.target.value } : c
                              ),
                            }))
                          }
                          className="bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] font-medium rounded px-2 py-1 w-36"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateConfig((prev) => ({
                              ...prev,
                              channels: prev.channels.map((c) =>
                                c.index === ch.index ? { ...c, pskBase64: generatePsk256() } : c
                              ),
                            }))
                          }
                          className="px-2 py-1 bg-[#182030] hover:bg-[#232F46] text-amber-300 rounded flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Rotate 256-bit</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        aria-label={`Channel ${ch.index} Base64 PSK`}
                        value={ch.pskBase64}
                        onChange={(e) =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            channels: prev.channels.map((c) =>
                              c.index === ch.index ? { ...c, pskBase64: e.target.value } : c
                            ),
                          }))
                        }
                        className="w-full bg-[#0B0F17] border border-[#253147] text-[#C8D3E6] font-mono text-[11px] rounded px-2 py-1"
                      />
                      <div className={`text-[11px] font-mono ${pskCheck.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pskCheck.valid ? `Valid AES-${pskCheck.bits}-CTR Key` : pskCheck.error}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Right: Seamless Multi-Device Cloud Sync & BLE Pairing */}
      <div className="lg:col-span-6 space-y-6">
        <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#E6ECF5] flex items-center gap-2">
                <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Multi-Device Cloud Sync</span>
              </h2>
              <p className="text-xs text-[#8E9BB3] mt-0.5">
                {user
                  ? `Signed in as ${user.email} · Real-time Firestore sync active.`
                  : 'Sign in with Google to sync T-Echo-Card profiles & layouts across devices.'}
              </p>
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onForceSync}
                  className="px-3 py-1.5 text-xs font-medium bg-[#182030] hover:bg-[#232F46] text-[#E6ECF5] border border-[#2B374E] rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Sync Now</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-3 py-1.5 text-xs font-medium bg-[#182030] hover:bg-[#232F46] text-[#A9B7D0] border border-[#2B374E] rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignInGoogle}
                className="px-4 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#090C12] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Connect Google Cloud Sync
              </button>
            )}
          </div>

          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg px-3.5 py-2.5 text-xs flex items-center justify-between gap-3">
            <span className="text-[#8E9BB3]">
              Status: <span className="text-[#E6ECF5] font-medium">{syncStatus}</span>
            </span>
            <span className="font-mono tabular-nums text-[#9AA7BD]">
              Rev {config.revision} · {config.deviceName}
            </span>
          </div>

          {syncError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-300">
              {syncError}
            </div>
          )}

          {/* Node Identity & BLE Config */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <label className="space-y-1">
              <span className="text-[#8E9BB3] block">Node Long Name</span>
              <input
                type="text"
                maxLength={48}
                value={config.deviceName}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    deviceName: e.target.value,
                  }))
                }
                className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] rounded-lg px-3 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#8E9BB3] block">Short Name (4 char)</span>
              <input
                type="text"
                maxLength={4}
                value={config.shortName}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    shortName: e.target.value.toUpperCase(),
                  }))
                }
                className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] font-mono uppercase rounded-lg px-3 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#8E9BB3] block">BLE Pairing PIN</span>
              <input
                type="text"
                maxLength={6}
                value={config.bleConfig.pinCode}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    bleConfig: { ...prev.bleConfig, pinCode: e.target.value },
                  }))
                }
                className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] font-mono tabular-nums rounded-lg px-3 py-1.5"
              />
            </label>
          </div>
        </section>

        {/* Paired Devices Registry */}
        <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#E6ECF5]">Synchronized Fleet Devices</h3>
            <p className="text-xs text-[#8E9BB3]">
              Layout, ringtone, and channel changes propagate automatically to every paired endpoint.
            </p>
          </div>

          <div className="space-y-2">
            {devices.map((dev) => (
              <div
                key={dev.id}
                className="bg-[#0B0F17] border border-[#1E2738] rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#E6ECF5] truncate">{dev.label}</div>
                  <div className="text-[11px] font-mono text-[#8E9BB3] uppercase">
                    {dev.platform} · Active Config {dev.activeConfigId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveDevice(dev.id)}
                  aria-label={`Unpair ${dev.label}`}
                  className="p-1.5 text-[#8E9BB3] hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handlePairDevice} className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="text"
              maxLength={64}
              value={newDeviceLabel}
              onChange={(e) => setNewDeviceLabel(e.target.value)}
              placeholder="Pair new phone, tablet, or T-Echo-Card..."
              className="flex-1 bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] placeholder-[#677691] text-xs rounded-lg px-3 py-2"
            />
            <select
              value={newDevicePlatform}
              onChange={(e) => setNewDevicePlatform(e.target.value as SyncedDevice['platform'])}
              className="bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] text-xs rounded-lg px-3 py-2"
            >
              <option value="ios">iOS App</option>
              <option value="android">Android App</option>
              <option value="desktop">Desktop Web</option>
              <option value="techo-usb">T-Echo-Card USB</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-[#182030] hover:bg-[#232F46] text-[#E6ECF5] border border-[#2B374E] text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pair Device
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
