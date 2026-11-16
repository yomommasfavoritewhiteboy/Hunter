import React, { useMemo } from 'react';
import { BatteryCharging, Compass, Layers, Radio, Zap } from 'lucide-react';
import type {
  ActivityState,
  AdaptivePowerSchedule,
  FirmwareConfig,
  ModemPreset,
  PowerMode,
  RegionCode,
} from '../types/techo';
import { applyPowerPreset, generateRuntimeCurve } from '../utils/powerEngine';
import {
  ASHEVILLE_CHANNEL_CANDIDATES,
  applyAshevilleAutoChannel,
  computeUs915SlotFrequencyMhz,
} from '../utils/regionalChannel';

interface PowerAndRadioConsoleProps {
  config: FirmwareConfig;
  batteryPct: number;
  activityState: ActivityState;
  schedule: AdaptivePowerSchedule;
  onChangeBatteryPct: (pct: number) => void;
  onChangeActivityState: (state: ActivityState) => void;
  onUpdateConfig: (updater: (prev: FirmwareConfig) => FirmwareConfig) => void;
}

const ACTIVITY_OPTIONS: { id: ActivityState; label: string }[] = [
  { id: 'stationary', label: 'Stationary' },
  { id: 'walking', label: 'Walking' },
  { id: 'trail', label: 'Active Trail' },
  { id: 'sos', label: 'SOS Override' },
];

const POWER_MODES: { id: Exclude<PowerMode, 'custom'>; label: string }[] = [
  { id: 'expedition', label: 'Expedition' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'performance', label: 'Performance' },
];

export const PowerAndRadioConsole: React.FC<PowerAndRadioConsoleProps> = ({
  config,
  batteryPct,
  activityState,
  schedule,
  onChangeBatteryPct,
  onChangeActivityState,
  onUpdateConfig,
}) => {
  const curve = useMemo(
    () =>
      generateRuntimeCurve(
        config.powerMode,
        config.powerPolicy,
        config.radioConfig,
        activityState,
        config.bleConfig.enabled
      ),
    [config.powerMode, config.powerPolicy, config.radioConfig, activityState, config.bleConfig.enabled]
  );

  const currentCurvePath = useMemo(() => {
    const maxMa = Math.max(10, ...curve.map((p) => p.avgCurrentMa));
    return curve
      .map((pt, idx) => {
        const x = (idx / Math.max(1, curve.length - 1)) * 520;
        const y = 130 - (pt.avgCurrentMa / maxMa) * 110;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [curve]);

  const gpsCurvePath = useMemo(() => {
    const maxGps = Math.max(60, ...curve.map((p) => p.gpsIntervalSec));
    return curve
      .map((pt, idx) => {
        const x = (idx / Math.max(1, curve.length - 1)) * 520;
        const y = 130 - (pt.gpsIntervalSec / maxGps) * 110;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [curve]);

  const handleSelectPowerMode = (mode: Exclude<PowerMode, 'custom'>) => {
    const nextPolicy = applyPowerPreset(mode);
    onUpdateConfig((prev) => ({
      ...prev,
      powerMode: mode,
      powerPolicy: nextPolicy,
    }));
  };

  const updatePolicyField = <K extends keyof FirmwareConfig['powerPolicy']>(
    field: K,
    value: FirmwareConfig['powerPolicy'][K]
  ) => {
    onUpdateConfig((prev) => ({
      ...prev,
      powerMode: 'custom',
      powerPolicy: {
        ...prev.powerPolicy,
        [field]: value,
      },
    }));
  };

  const handleApplyAsheville = (preferBackcountry: boolean) => {
    onUpdateConfig((prev) => {
      const { radioConfig, selected } = applyAshevilleAutoChannel(
        prev.radioConfig,
        35.5951,
        -82.5515,
        preferBackcountry
      );
      const updatedChannels = prev.channels.map((ch, idx) =>
        idx === 0 ? { ...ch, name: selected.channelName } : ch
      );
      return {
        ...prev,
        radioConfig,
        channels: updatedChannels,
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Live Field Power Simulation Control Bar */}
      <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#E6ECF5] flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-amber-400" />
              <span>Adaptive Power Policy Testbench</span>
            </h2>
            <p className="text-xs text-[#8E9BB3]">
              Simulate battery state and user movement to inspect live nRF52840, L76K GPS, BLE 5.0, and 0.42&quot; OLED throttling.
            </p>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div className="text-sm font-semibold text-amber-400">{schedule.tierLabel}</div>
            <div className="text-xs text-[#8E9BB3]">
              {schedule.avgCurrentMa} mA avg · {schedule.estimatedHoursRemaining}h est (vs {schedule.baselineHoursRemaining}h unmanaged)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center pt-1">
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="sim-battery-slider" className="text-[#A9B7D0] font-medium">
                Simulated LiPo Charge (850 mAh)
              </label>
              <span className="font-mono font-semibold tabular-nums text-[#E6ECF5]">{batteryPct}%</span>
            </div>
            <input
              id="sim-battery-slider"
              type="range"
              min={1}
              max={100}
              value={batteryPct}
              onChange={(e) => onChangeBatteryPct(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="lg:col-span-7 space-y-2">
            <div className="text-xs text-[#A9B7D0] font-medium">User Motion &amp; Field Activity State</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#0B0F17] p-1 rounded-lg border border-[#1E2738]">
              {ACTIVITY_OPTIONS.map((opt) => {
                const active = activityState === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeActivityState(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? opt.id === 'sos'
                          ? 'bg-rose-500 text-white'
                          : 'bg-amber-500 text-[#090C12]'
                        : 'text-[#9AA7BD] hover:text-[#E6ECF5]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Scheduled Targets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3">
            <div className="text-[11px] text-[#8E9BB3]">L76K GPS Polling</div>
            <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
              {schedule.gpsIntervalSec === 0 ? 'OFF' : `${schedule.gpsIntervalSec}s`}
            </div>
            <div className="text-[11px] text-cyan-400">{schedule.gpsMode}</div>
          </div>
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3">
            <div className="text-[11px] text-[#8E9BB3]">BLE 5.0 Interval</div>
            <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
              {config.bleConfig.enabled ? `${schedule.bleIntervalMs} ms` : 'OFF'}
            </div>
            <div className="text-[11px] text-cyan-400">{schedule.bleState}</div>
          </div>
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3">
            <div className="text-[11px] text-[#8E9BB3]">0.42&quot; OLED Wake</div>
            <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
              {schedule.einkRefreshSec}s
            </div>
            <div className="text-[11px] text-cyan-400">{schedule.einkMode}</div>
          </div>
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3">
            <div className="text-[11px] text-[#8E9BB3]">SX1262 LoRa TX</div>
            <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
              {schedule.loraTxDbm} dBm
            </div>
            <div className="text-[11px] text-amber-400">{schedule.savingsPct}% power saved</div>
          </div>
        </div>

        <ul className="space-y-1 text-xs text-[#9AA7BD] pt-1">
          {schedule.rationale.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Battery Policy Parameters + Adaptive Curve */}
        <section className="xl:col-span-7 bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#E6ECF5] flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Intelligent Power Saving Curve</span>
              </h3>
              <p className="text-xs text-[#8E9BB3]">
                Current mode: <span className="text-[#E6ECF5] font-medium capitalize">{config.powerMode}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#0B0F17] border border-[#1E2738] p-1 rounded-lg">
              {POWER_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectPowerMode(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.powerMode === m.id
                      ? 'bg-amber-500 text-[#090C12]'
                      : 'text-[#9AA7BD] hover:text-[#E6ECF5]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dual-Axis Discharge Response Curve */}
          <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#8E9BB3]">
              <span>100% → 5% Battery Discharge Response</span>
              <span className="flex items-center gap-3">
                <span className="text-amber-400">― Draw (mA)</span>
                <span className="text-cyan-400">― GPS Poll (s)</span>
              </span>
            </div>
            <svg
              viewBox="0 0 520 140"
              className="w-full h-36 overflow-visible"
              role="img"
              aria-label="Adaptive power draw and GPS polling interval across battery discharge"
            >
              <line x1="0" y1="130" x2="520" y2="130" stroke="#1E2738" strokeWidth="1" />
              <line x1="0" y1="70" x2="520" y2="70" stroke="#18202E" strokeWidth="1" strokeDasharray="3 3" />
              <path d={gpsCurvePath} fill="none" stroke="#06B6D4" strokeWidth="2" />
              <path d={currentCurvePath} fill="none" stroke="#F59E0B" strokeWidth="2.2" />
            </svg>
          </div>

          {/* Fine-Grained Threshold Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>Low-Battery Threshold</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.lowBatteryThresholdPct}%
                </span>
              </span>
              <input
                type="range"
                min={10}
                max={45}
                value={config.powerPolicy.lowBatteryThresholdPct}
                onChange={(e) => updatePolicyField('lowBatteryThresholdPct', Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>Critical Survival Threshold</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.criticalBatteryThresholdPct}%
                </span>
              </span>
              <input
                type="range"
                min={3}
                max={20}
                value={config.powerPolicy.criticalBatteryThresholdPct}
                onChange={(e) => updatePolicyField('criticalBatteryThresholdPct', Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>Stationary GPS Interval</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.gpsStationarySec}s
                </span>
              </span>
              <input
                type="range"
                min={60}
                max={1800}
                step={30}
                value={config.powerPolicy.gpsStationarySec}
                onChange={(e) => updatePolicyField('gpsStationarySec', Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>Active Trail GPS Interval</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.gpsActiveSec}s
                </span>
              </span>
              <input
                type="range"
                min={5}
                max={180}
                step={5}
                value={config.powerPolicy.gpsActiveSec}
                onChange={(e) => updatePolicyField('gpsActiveSec', Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>BLE Base Advertising</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.bleAdvertisingIntervalMs} ms
                </span>
              </span>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={config.powerPolicy.bleAdvertisingIntervalMs}
                onChange={(e) => updatePolicyField('bleAdvertisingIntervalMs', Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="flex justify-between text-[#A9B7D0]">
                <span>0.42&quot; OLED Refresh Base</span>
                <span className="font-mono tabular-nums text-[#E6ECF5]">
                  {config.powerPolicy.einkPartialRefreshSec}s
                </span>
              </span>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={config.powerPolicy.einkPartialRefreshSec}
                onChange={(e) => updatePolicyField('einkPartialRefreshSec', Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 pt-1 text-xs">
            <label className="flex items-center gap-2 text-[#E6ECF5] cursor-pointer">
              <input
                type="checkbox"
                checked={config.powerPolicy.deepSleepEnabled}
                onChange={(e) => updatePolicyField('deepSleepEnabled', e.target.checked)}
                className="accent-amber-500 rounded"
              />
              <span>nRF52840 System-ON Deep Sleep</span>
            </label>
            <label className="flex items-center gap-2 text-[#E6ECF5] cursor-pointer">
              <input
                type="checkbox"
                checked={config.powerPolicy.adaptiveTxScaling}
                onChange={(e) => updatePolicyField('adaptiveTxScaling', e.target.checked)}
                className="accent-amber-500 rounded"
              />
              <span>Adaptive LoRa TX Power Scaling</span>
            </label>
            <label className="flex items-center gap-2 text-[#E6ECF5] cursor-pointer">
              <input
                type="checkbox"
                checked={config.powerPolicy.motionWakeEnabled}
                onChange={(e) => updatePolicyField('motionWakeEnabled', e.target.checked)}
                className="accent-amber-500 rounded"
              />
              <span>ICM20948 IMU Motion Wake Trigger</span>
            </label>
          </div>
        </section>

        {/* Right: Asheville Local Auto-Channel + Dual-Stack (Meshtastic + MeshCore) */}
        <div className="xl:col-span-5 space-y-6">
          {/* Asheville Auto Channel Optimizer */}
          <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5] flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span>Asheville Local Channel Optimizer</span>
                </h3>
                <p className="text-xs text-[#8E9BB3]">
                  Auto-tunes US915 slot &amp; modem preset for Western North Carolina repeaters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleApplyAsheville(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Auto-Tune Asheville
              </button>
            </div>

            <div className="space-y-2">
              {ASHEVILLE_CHANNEL_CANDIDATES.map((cand) => {
                const isSelected =
                  config.radioConfig.frequencySlot === cand.frequencySlot &&
                  config.radioConfig.modemPreset === cand.modemPreset;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        radioConfig: {
                          ...prev.radioConfig,
                          region: 'US',
                          modemPreset: cand.modemPreset,
                          frequencySlot: cand.frequencySlot,
                          frequencyMhz: cand.frequencyMhz,
                          hopLimit: cand.hopLimit,
                          txPowerDbm: cand.recommendedTxDbm,
                          autoLocalChannel: true,
                          localAreaLabel: cand.area,
                        },
                      }))
                    }
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#152031] border-cyan-500/60'
                        : 'bg-[#0B0F17] border-[#1E2738] hover:border-[#2F3E58]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#E6ECF5]">{cand.area}</span>
                      <span className="font-mono tabular-nums text-cyan-400">
                        Slot {cand.frequencySlot} · {cand.frequencyMhz} MHz
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#8E9BB3] leading-relaxed">{cand.summary}</p>
                    <div className="mt-1.5 text-[11px] font-mono tabular-nums text-[#9AA7BD]">
                      {cand.modemPreset} · {cand.activeNodesNearby} local nodes · Score {cand.linkQualityScore}/100
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs pt-1">
              <label className="space-y-1">
                <span className="text-[#8E9BB3] block">Region</span>
                <select
                  value={config.radioConfig.region}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      radioConfig: { ...prev.radioConfig, region: e.target.value as RegionCode },
                    }))
                  }
                  className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] rounded-lg px-2.5 py-1.5"
                >
                  <option value="US">US (915 MHz)</option>
                  <option value="EU_868">EU_868</option>
                  <option value="ANZ">ANZ</option>
                  <option value="JP">JP</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[#8E9BB3] block">Modem Preset</span>
                <select
                  value={config.radioConfig.modemPreset}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      radioConfig: {
                        ...prev.radioConfig,
                        modemPreset: e.target.value as ModemPreset,
                        autoLocalChannel: false,
                      },
                    }))
                  }
                  className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] rounded-lg px-2.5 py-1.5"
                >
                  <option value="LONG_FAST">LONG_FAST</option>
                  <option value="MEDIUM_FAST">MEDIUM_FAST</option>
                  <option value="LONG_SLOW">LONG_SLOW</option>
                  <option value="VERY_LONG_SLOW">VERY_LONG_SLOW</option>
                  <option value="SHORT_FAST">SHORT_FAST</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[#8E9BB3] block">US Slot (1–104)</span>
                <input
                  type="number"
                  min={1}
                  max={104}
                  value={config.radioConfig.frequencySlot}
                  onChange={(e) => {
                    const slot = Math.max(1, Math.min(104, Number(e.target.value) || 20));
                    onUpdateConfig((prev) => ({
                      ...prev,
                      radioConfig: {
                        ...prev.radioConfig,
                        frequencySlot: slot,
                        frequencyMhz: computeUs915SlotFrequencyMhz(slot),
                        autoLocalChannel: false,
                      },
                    }));
                  }}
                  className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] font-mono tabular-nums rounded-lg px-2.5 py-1.5"
                />
              </label>
            </div>
          </section>

          {/* Concurrent Meshtastic + MeshCore Dual-Stack TDM */}
          <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Meshtastic + MeshCore Dual-Stack</span>
                </h3>
                <p className="text-xs text-[#8E9BB3]">
                  Time-division multiplexes SX1262 sync words (0x2B &amp; 0x12) to run both protocols concurrently.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-[#E6ECF5] cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={config.radioConfig.dualStack.enabled}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      radioConfig: {
                        ...prev.radioConfig,
                        dualStack: { ...prev.radioConfig.dualStack, enabled: e.target.checked },
                      },
                    }))
                  }
                  className="accent-amber-500 rounded"
                />
                <span>Enabled</span>
              </label>
            </div>

            {config.radioConfig.dualStack.enabled && (
              <div className="space-y-3 text-xs">
                <label className="block space-y-1.5">
                  <span className="flex justify-between text-[#A9B7D0]">
                    <span>Radio Duty-Cycle Split</span>
                    <span className="font-mono tabular-nums text-amber-300">
                      {config.radioConfig.dualStack.meshtasticSharePct}% Meshtastic /{' '}
                      {100 - config.radioConfig.dualStack.meshtasticSharePct}% MeshCore
                    </span>
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={80}
                    step={5}
                    value={config.radioConfig.dualStack.meshtasticSharePct}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        radioConfig: {
                          ...prev.radioConfig,
                          dualStack: {
                            ...prev.radioConfig.dualStack,
                            meshtasticSharePct: Number(e.target.value),
                          },
                        },
                      }))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#8E9BB3] block">MeshCore Role</span>
                    <select
                      value={config.radioConfig.dualStack.meshcoreRole}
                      onChange={(e) =>
                        onUpdateConfig((prev) => ({
                          ...prev,
                          radioConfig: {
                            ...prev.radioConfig,
                            dualStack: {
                              ...prev.radioConfig.dualStack,
                              meshcoreRole: e.target.value as 'companion' | 'repeater' | 'room-server',
                            },
                          },
                        }))
                      }
                      className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] rounded-lg px-2.5 py-1.5"
                    >
                      <option value="companion">Companion Node</option>
                      <option value="repeater">Field Repeater</option>
                      <option value="room-server">Room Server</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#8E9BB3] block">MeshCore Freq (MHz)</span>
                    <input
                      type="number"
                      step="0.025"
                      min={902.125}
                      max={927.875}
                      value={config.radioConfig.dualStack.meshcoreFreqMhz}
                      onChange={(e) =>
                        onUpdateConfig((prev) => ({
                          ...prev,
                          radioConfig: {
                            ...prev.radioConfig,
                            dualStack: {
                              ...prev.radioConfig.dualStack,
                              meshcoreFreqMhz: Number(e.target.value) || 910.525,
                            },
                          },
                        }))
                      }
                      className="w-full bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] font-mono tabular-nums rounded-lg px-2.5 py-1.5"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[#E6ECF5] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={config.radioConfig.dualStack.crossBridgeEnabled}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        radioConfig: {
                          ...prev.radioConfig,
                          dualStack: {
                            ...prev.radioConfig.dualStack,
                            crossBridgeEnabled: e.target.checked,
                          },
                        },
                      }))
                    }
                    className="accent-amber-500 rounded"
                  />
                  <span>Bridge incoming MeshCore telemetry alerts to OLED &amp; BLE</span>
                </label>

                <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg px-3 py-2 text-[11px] font-mono text-[#8E9BB3] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    <span>SX1262 CAD Retune: 1.8 ms</span>
                  </span>
                  <span>Sync 0x2B ↔ {config.radioConfig.dualStack.meshcoreSyncWord}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
