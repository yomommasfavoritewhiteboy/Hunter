import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Eye,
  EyeOff,
  LayoutGrid,
  Lock,
  Radio,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ActivityState,
  AdaptivePowerSchedule,
  DashboardModuleConfig,
  FirmwareConfig,
  MeshMessage,
  MeshNeighbor,
  TelemetryPoint,
} from '../types/techo';
import { TechoHardwareTwin } from './TechoHardwareTwin';

interface TelemetryDashboardProps {
  config: FirmwareConfig;
  series: TelemetryPoint[];
  neighbors: MeshNeighbor[];
  messages: MeshMessage[];
  schedule: AdaptivePowerSchedule;
  batteryPct: number;
  activityState: ActivityState;
  einkFlashTick: number;
  onTestRingtone: () => void;
  onSimulatePacket: () => void;
  onForceEinkRefresh: () => void;
  onSendMessage: (channelIndex: number, text: string) => void;
  onUpdateConfig: (updater: (prev: FirmwareConfig) => FirmwareConfig) => void;
  onOpenMobileSync: () => void;
  onRestoreModules: () => void;
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.01, max - min);
  return values
    .map((val, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const y = height - ((val - min) / span) * (height - 8) - 4;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  config,
  series,
  neighbors,
  messages,
  schedule,
  batteryPct,
  activityState,
  einkFlashTick,
  onTestRingtone,
  onSimulatePacket,
  onForceEinkRefresh,
  onSendMessage,
  onUpdateConfig,
  onOpenMobileSync,
  onRestoreModules,
}) => {
  const latest = series[series.length - 1];
  const [selectedNeighborId, setSelectedNeighborId] = useState<string>(neighbors[0]?.id ?? '');
  const [draftMsg, setDraftMsg] = useState('');
  const [activeChannelIdx, setActiveChannelIdx] = useState<number>(config.channels[0]?.index ?? 0);
  const [showCipherHex, setShowCipherHex] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);

  const activeNeighbor = neighbors.find((n) => n.id === selectedNeighborId) ?? neighbors[0];

  const sortedAllModules = useMemo(
    () => [...config.dashboardLayout].sort((a, b) => a.order - b.order),
    [config.dashboardLayout]
  );

  const enabledModules = useMemo(
    () => sortedAllModules.filter((m) => m.enabled),
    [sortedAllModules]
  );

  const moveModule = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= sortedAllModules.length) return;
    const reordered = [...sortedAllModules];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, item);
    onUpdateConfig((prev) => ({
      ...prev,
      lastSyncedDevice: 'EchoMesh Web',
      dashboardLayout: reordered.map((m, i) => ({ ...m, order: i })),
    }));
  };

  const currentSparkPath = useMemo(
    () => buildSparklinePath(series.map((p) => p.currentMa), 280, 74),
    [series]
  );
  const snrSparkPath = useMemo(
    () => buildSparklinePath(series.map((p) => p.snrDb), 280, 68),
    [series]
  );
  const tempSparkPath = useMemo(
    () => buildSparklinePath(series.map((p) => p.tempC), 240, 56),
    [series]
  );

  const handleMsgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftMsg.trim();
    if (!trimmed) return;
    onSendMessage(activeChannelIdx, trimmed);
    setDraftMsg('');
  };

  const renderModule = (mod: DashboardModuleConfig) => {
    const colSpan = mod.size === 'expanded' ? 'xl:col-span-2' : 'xl:col-span-1';

    switch (mod.id) {
      case 'gps_nav':
        return (
          <article
            key={mod.id}
            data-testid="module-gps_nav"
            className={`${colSpan} bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col justify-between gap-4`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  L76K GNSS · {schedule.gpsMode} · {schedule.gpsIntervalSec === 0 ? 'Off' : `${schedule.gpsIntervalSec}s poll`}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-cyan-400">
                {latest.satellites} sats · HDOP {latest.hdop}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Latitude</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
                  {latest.lat.toFixed(5)}°
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Longitude</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
                  {latest.lon.toFixed(5)}°
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Altitude</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#E6ECF5]">
                  {latest.altitudeM} m
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Local Zone</div>
                <div className="text-sm font-medium text-amber-300 truncate">
                  {config.radioConfig.localAreaLabel}
                </div>
              </div>
            </div>
          </article>
        );

      case 'power_telemetry':
        return (
          <article
            key={mod.id}
            data-testid="module-power_telemetry"
            className={`${colSpan} bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col justify-between gap-4`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  {schedule.tierLabel} · {schedule.savingsPct}% savings vs always-on
                </p>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono font-bold tabular-nums text-amber-400">
                  {schedule.estimatedHoursRemaining} h
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#8E9BB3]">
                  {latest.voltageMv} mV · {schedule.avgCurrentMa} mA
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <svg
                viewBox="0 0 280 74"
                className="w-full h-20 overflow-visible bg-[#0B0F17] border border-[#1E2738] rounded-lg p-1.5"
                role="img"
                aria-label="Adaptive current draw sparkline"
              >
                <path
                  d={currentSparkPath}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>

              <div className="space-y-1.5 text-xs font-mono tabular-nums">
                {[
                  { label: 'L76K GNSS', val: schedule.breakdownMa.gps, color: 'bg-cyan-400' },
                  { label: 'SX1262 LoRa', val: schedule.breakdownMa.lora, color: 'bg-amber-400' },
                  { label: 'nRF52 MCU', val: schedule.breakdownMa.mcu, color: 'bg-emerald-400' },
                  { label: 'BLE + OLED', val: Number((schedule.breakdownMa.ble + schedule.breakdownMa.eink).toFixed(2)), color: 'bg-indigo-400' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="w-24 text-[#9AA7BD] shrink-0">{row.label}</span>
                    <div className="flex-1 h-1.5 bg-[#192130] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.color}`}
                        style={{ width: `${Math.min(100, (row.val / Math.max(1, schedule.avgCurrentMa)) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-[#E6ECF5]">{row.val} mA</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        );

      case 'env_bme280':
        return (
          <article
            key={mod.id}
            data-testid="module-env_bme280"
            className={`${colSpan} bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col justify-between gap-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  ICM20948 I2C + 0.25W Solar · {config.radioConfig.bme280Enabled ? 'Sampling active' : 'Sensor muted'}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#8E9BB3]">
                {mod.refreshRateSec}s rate
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Heading</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-[#E6ECF5]">
                  {latest.imuHeadingDeg ?? 214}°
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Motion</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-[#E6ECF5]">
                  {(latest.imuAccelG ?? 1.02).toFixed(2)} G
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#8E9BB3]">Solar Panel</div>
                <div className="text-xl font-mono font-semibold tabular-nums text-amber-300">
                  {((latest.solarMv ?? 4820) / 1000).toFixed(2)} V
                </div>
              </div>
            </div>

            <svg
              viewBox="0 0 240 56"
              className="w-full h-14 bg-[#0B0F17] border border-[#1E2738] rounded-lg p-1.5"
              role="img"
              aria-label="Sensor thermal and solar trend"
            >
              <path
                d={tempSparkPath}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </article>
        );

      case 'lora_mesh':
        return (
          <article
            key={mod.id}
            data-testid="module-lora_mesh"
            className={`${colSpan} bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col justify-between gap-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  {config.radioConfig.modemPreset} · Slot {config.radioConfig.frequencySlot} ({config.radioConfig.frequencyMhz.toFixed(3)} MHz)
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-cyan-400">
                {schedule.loraTxDbm} dBm
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-2.5">
                <div className="text-[#8E9BB3] text-[11px]">SNR / RSSI</div>
                <div className="text-base font-semibold text-[#E6ECF5]">
                  +{latest.snrDb.toFixed(1)} dB · {latest.rssiDbm} dBm
                </div>
              </div>
              <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-2.5">
                <div className="text-[#8E9BB3] text-[11px]">Dual-Stack TDM</div>
                <div className="text-base font-semibold text-amber-300">
                  {config.radioConfig.dualStack.enabled
                    ? `MT ${config.radioConfig.dualStack.meshtasticSharePct}% / MC ${100 - config.radioConfig.dualStack.meshtasticSharePct}%`
                    : 'Meshtastic Only'}
                </div>
              </div>
            </div>

            <svg
              viewBox="0 0 280 68"
              className="w-full h-16 bg-[#0B0F17] border border-[#1E2738] rounded-lg p-1.5"
              role="img"
              aria-label="LoRa link SNR trace"
            >
              <path
                d={snrSparkPath}
                fill="none"
                stroke="#34D399"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </article>
        );

      case 'crypto_inbox':
        return (
          <article
            key={mod.id}
            data-testid="module-crypto_inbox"
            className={`${colSpan} xl:col-span-2 bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col gap-3`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  AES-256-CTR Channel Framing · {config.channels.length} active keys
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCipherHex((v) => !v)}
                className="px-2.5 py-1.5 text-xs font-medium text-[#A9B7D0] hover:text-[#E6ECF5] bg-[#161E2C] border border-[#253147] rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {showCipherHex ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showCipherHex ? 'Hide Cipher Hex' : 'Inspect Ciphertext'}</span>
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {messages.map((msg) => {
                const chName =
                  config.channels.find((c) => c.index === msg.channelIndex)?.name ?? `CH${msg.channelIndex}`;
                return (
                  <div
                    key={msg.id}
                    className="bg-[#0B0F17] border border-[#1E2738] rounded-lg px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 text-[#8E9BB3] font-mono tabular-nums mb-1">
                      <span>
                        {msg.senderShort} · {chName} · Hop {msg.hopLimit}
                      </span>
                      <span>SNR {msg.snrDb > 0 ? `+${msg.snrDb}` : msg.snrDb} dB</span>
                    </div>
                    <p className="text-[#E6ECF5] text-[13px] leading-snug">{msg.plaintext}</p>
                    {showCipherHex && (
                      <p className="mt-1.5 font-mono text-[11px] text-amber-300/80 break-all">
                        0x{msg.ciphertextHex}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleMsgSubmit} className="flex flex-col sm:flex-row gap-2 pt-1">
              <label htmlFor="channel-select" className="sr-only">
                Select encrypted channel
              </label>
              <select
                id="channel-select"
                value={activeChannelIdx}
                onChange={(e) => setActiveChannelIdx(Number(e.target.value))}
                className="bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
              >
                {config.channels.map((ch) => (
                  <option key={ch.index} value={ch.index}>
                    CH{ch.index} · {ch.name}
                  </option>
                ))}
              </select>
              <label htmlFor="mesh-msg-input" className="sr-only">
                Encrypted message text
              </label>
              <input
                id="mesh-msg-input"
                type="text"
                maxLength={237}
                value={draftMsg}
                onChange={(e) => setDraftMsg(e.target.value)}
                placeholder="Transmit AES-256 encrypted packet..."
                className="flex-1 bg-[#0B0F17] border border-[#253147] text-[#E6ECF5] placeholder-[#677691] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-[#090C12] font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Send Encrypted</span>
                <Send className="w-3 h-3" />
              </button>
            </form>
          </article>
        );

      case 'ble_link':
        return (
          <article
            key={mod.id}
            data-testid="module-ble_link"
            className={`${colSpan} bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col justify-between gap-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E6ECF5]">{mod.title}</h3>
                <p className="text-xs text-[#8E9BB3]">
                  nRF52840 S140 · {schedule.bleState}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-cyan-400">
                {config.bleConfig.enabled ? `${schedule.bleIntervalMs} ms` : 'Disabled'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="text-[#8E9BB3] text-[11px]">Pairing PIN</div>
                <div className="text-sm font-semibold text-[#E6ECF5]">{config.bleConfig.pinCode}</div>
              </div>
              <div>
                <div className="text-[#8E9BB3] text-[11px]">ATT MTU</div>
                <div className="text-sm font-semibold text-[#E6ECF5]">{config.bleConfig.mtuSize} B</div>
              </div>
              <div>
                <div className="text-[#8E9BB3] text-[11px]">Last Sync</div>
                <div className="text-xs text-[#E6ECF5] truncate">{config.lastSyncedDevice}</div>
              </div>
            </div>
          </article>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Calibrated Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#10151F] border border-[#222C3E] rounded-xl px-4 py-3.5">
          <div className="text-xs text-[#8E9BB3]">Projected Field Endurance</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold tabular-nums text-[#E6ECF5]">
                {schedule.estimatedHoursRemaining}
              </span>
              <span className="text-xs font-mono text-[#8E9BB3]">HRS</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-emerald-400 whitespace-nowrap">
              +{schedule.savingsPct}% saved
            </span>
          </div>
        </div>

        <div className="bg-[#10151F] border border-[#222C3E] rounded-xl px-4 py-3.5">
          <div className="text-xs text-[#8E9BB3]">Asheville Local RF Slot</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold tabular-nums text-amber-400">
                {config.radioConfig.frequencyMhz.toFixed(3)}
              </span>
              <span className="text-xs font-mono text-[#8E9BB3]">MHz</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9AA7BD] whitespace-nowrap">
              Slot {config.radioConfig.frequencySlot}
            </span>
          </div>
        </div>

        <div className="bg-[#10151F] border border-[#222C3E] rounded-xl px-4 py-3.5">
          <div className="text-xs text-[#8E9BB3]">Dual-Stack Radio Split</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-mono font-bold tabular-nums text-[#E6ECF5]">
              {config.radioConfig.dualStack.enabled
                ? `${config.radioConfig.dualStack.meshtasticSharePct}/${100 - config.radioConfig.dualStack.meshtasticSharePct}`
                : '100/0'}
            </span>
            <span className="text-xs text-[#8E9BB3] truncate">
              {config.radioConfig.dualStack.enabled ? 'Meshtastic + MeshCore' : 'Meshtastic only'}
            </span>
          </div>
        </div>

        <div className="bg-[#10151F] border border-[#222C3E] rounded-xl px-4 py-3.5">
          <div className="text-xs text-[#8E9BB3]">Multi-Device Sync</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[#E6ECF5] truncate">
              Rev {config.revision} · {config.lastSyncedDevice}
            </span>
            <button
              type="button"
              onClick={onOpenMobileSync}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Sync</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Instrument Column: T-Echo Hardware Twin + Blue Ridge RF Polar Radar */}
        <div className="lg:col-span-4 space-y-6">
          <TechoHardwareTwin
            config={config}
            telemetry={latest}
            schedule={schedule}
            batteryPct={batteryPct}
            activityState={activityState}
            lastMessage={messages[messages.length - 1]}
            onTestRingtone={onTestRingtone}
            onSimulatePacket={onSimulatePacket}
            onForceRefresh={onForceEinkRefresh}
            einkFlashTick={einkFlashTick}
          />

          {/* Local Asheville Blue Ridge RF Polar Radar */}
          <section className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#E6ECF5]">Asheville Basin RF Radar</h2>
                <p className="text-xs text-[#8E9BB3]">4 active nodes · {config.radioConfig.modemPreset}</p>
              </div>
              <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
            </div>

            <div className="flex justify-center">
              <svg
                viewBox="0 0 240 240"
                className="w-56 h-56 cursor-crosshair"
                role="img"
                aria-label="Asheville local Meshtastic neighbor radar"
              >
                <circle cx="120" cy="120" r="105" fill="#0B0F17" stroke="#222C3E" strokeWidth="1" />
                <circle cx="120" cy="120" r="70" fill="none" stroke="#1E2738" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx="120" cy="120" r="35" fill="none" stroke="#1E2738" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="120" y1="15" x2="120" y2="225" stroke="#1A2232" strokeWidth="1" />
                <line x1="15" y1="120" x2="225" y2="120" stroke="#1A2232" strokeWidth="1" />
                <text x="120" y="26" textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono">N</text>
                <text x="214" y="123" textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono">E</text>
                <circle cx="120" cy="120" r="4" fill="#F59E0B" />

                {neighbors.map((n) => {
                  const rad = ((n.bearingDeg - 90) * Math.PI) / 180;
                  const distPx = Math.min(95, (n.distanceKm / 24) * 95);
                  const nx = 120 + Math.cos(rad) * distPx;
                  const ny = 120 + Math.sin(rad) * distPx;
                  const isSelected = activeNeighbor?.id === n.id;
                  return (
                    <g
                      key={n.id}
                      onClick={() => setSelectedNeighborId(n.id)}
                      className="cursor-pointer"
                    >
                      <line
                        x1="120"
                        y1="120"
                        x2={nx}
                        y2={ny}
                        stroke={isSelected ? '#06B6D4' : '#253249'}
                        strokeWidth={isSelected ? '1.5' : '1'}
                      />
                      <circle
                        cx={nx}
                        cy={ny}
                        r={isSelected ? 6 : 4.5}
                        fill={isSelected ? '#06B6D4' : '#38BDF8'}
                        stroke="#090C12"
                        strokeWidth="1.5"
                      />
                      <text
                        x={nx}
                        y={ny - 9}
                        textAnchor="middle"
                        fill={isSelected ? '#E6ECF5' : '#8E9BB3'}
                        fontSize="9"
                        fontFamily="JetBrains Mono"
                      >
                        {n.shortName}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {activeNeighbor && (
              <div className="bg-[#0B0F17] border border-[#1E2738] rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#E6ECF5]">{activeNeighbor.longName}</span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {activeNeighbor.distanceKm} km
                  </span>
                </div>
                <div className="font-mono tabular-nums text-[#8E9BB3] flex justify-between">
                  <span>SNR +{activeNeighbor.snrDb} dB · {activeNeighbor.rssiDbm} dBm</span>
                  <span>{activeNeighbor.hops} hops · {activeNeighbor.batteryPct}%</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Main Stage: Modular Sensor Dashboard */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#E6ECF5]">Modular Sensor Dashboard</h2>
              <p className="text-xs text-[#8E9BB3]">
                {enabledModules.length} active modules · Synced across EchoMesh Web, Mobile &amp; T-Echo-Card OLED
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingLayout((v) => !v)}
                className={`px-3.5 py-2 text-xs font-medium border rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isEditingLayout
                    ? 'bg-cyan-500 text-[#090C12] border-cyan-500'
                    : 'bg-[#161E2C] hover:bg-[#1E293B] text-[#E6ECF5] border-[#2B374E]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isEditingLayout ? 'Done Editing' : 'Edit Layout'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenMobileSync}
                className="px-3.5 py-2 text-xs font-medium bg-[#161E2C] hover:bg-[#1E293B] text-[#E6ECF5] border border-[#2B374E] rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Mobile Companion</span>
              </button>
            </div>
          </div>

          {isEditingLayout && (
            <section
              aria-label="Inline dashboard module customizer"
              className="bg-[#10151F] border border-cyan-500/40 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#E6ECF5]">
                  Customize Displayed Metrics &amp; Module Order
                </span>
                <button
                  type="button"
                  onClick={onRestoreModules}
                  className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sortedAllModules.map((mod, idx) => (
                  <div
                    key={mod.id}
                    className="bg-[#0B0F17] border border-[#1E2738] rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <label className="flex items-center gap-2 text-[#E6ECF5] cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={mod.enabled}
                        onChange={(e) =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            lastSyncedDevice: 'EchoMesh Web',
                            dashboardLayout: prev.dashboardLayout.map((m) =>
                              m.id === mod.id ? { ...m, enabled: e.target.checked } : m
                            ),
                          }))
                        }
                        className="accent-cyan-400 rounded shrink-0"
                      />
                      <span className="truncate">{mod.title}</span>
                    </label>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            lastSyncedDevice: 'EchoMesh Web',
                            dashboardLayout: prev.dashboardLayout.map((m) =>
                              m.id === mod.id
                                ? { ...m, size: m.size === 'expanded' ? 'compact' : 'expanded' }
                                : m
                            ),
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-[#161E2C] text-[#A9B7D0] hover:text-white font-mono text-[11px] cursor-pointer"
                      >
                        {mod.size}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModule(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move ${mod.title} earlier`}
                        className="p-1 rounded bg-[#161E2C] text-[#A9B7D0] disabled:opacity-30 hover:text-white cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModule(idx, 1)}
                        disabled={idx === sortedAllModules.length - 1}
                        aria-label={`Move ${mod.title} later`}
                        className="p-1 rounded bg-[#161E2C] text-[#A9B7D0] disabled:opacity-30 hover:text-white cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {enabledModules.length === 0 ? (
            <div className="bg-[#10151F] border border-[#222C3E] rounded-xl p-10 text-center space-y-3">
              <h3 className="text-sm font-semibold text-[#E6ECF5]">No Dashboard Modules Enabled</h3>
              <p className="text-xs text-[#8E9BB3] max-w-md mx-auto">
                All sensor widgets are currently toggled off in your Mobile Companion layout settings.
              </p>
              <button
                type="button"
                onClick={onRestoreModules}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#090C12] rounded-lg transition-colors cursor-pointer"
              >
                Restore Default Modules
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {enabledModules.map((mod) => renderModule(mod))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
