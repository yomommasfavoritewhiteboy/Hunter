import React from 'react';
import { Volume2, RefreshCw, Sun } from 'lucide-react';
import type {
  ActivityState,
  AdaptivePowerSchedule,
  FirmwareConfig,
  MeshMessage,
  TelemetryPoint,
} from '../types/techo';

interface TechoHardwareTwinProps {
  config: FirmwareConfig;
  telemetry: TelemetryPoint;
  schedule: AdaptivePowerSchedule;
  batteryPct: number;
  activityState: ActivityState;
  lastMessage?: MeshMessage;
  onTestRingtone: () => void;
  onSimulatePacket: () => void;
  onForceRefresh: () => void;
  einkFlashTick: number;
}

export const TechoHardwareTwin: React.FC<TechoHardwareTwinProps> = ({
  config,
  telemetry,
  schedule,
  batteryPct,
  activityState,
  lastMessage,
  onTestRingtone,
  onSimulatePacket,
  onForceRefresh,
  einkFlashTick,
}) => {
  const oledModules = [...config.dashboardLayout]
    .filter((m) => m.enabled && m.showOnEInk)
    .sort((a, b) => a.order - b.order)
    .slice(0, 3);

  const solarMv = telemetry.solarMv ?? 4820;

  return (
    <section
      aria-label="LilyGO T-Echo-Card Hardware Preview"
      className="bg-[#10151F] border border-[#222C3E] rounded-xl p-5 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#E6ECF5]">LilyGO T-Echo-Card Twin</h2>
          <p className="text-xs text-[#8E9BB3]">
            nRF52840 · SX1262 · {config.radioConfig.frequencyMhz.toFixed(3)} MHz
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-amber-400">
          {schedule.einkRefreshSec}s wake
        </span>
      </div>

      {/* Physical T-Echo-Card Enclosure (90 x 60 x 9.5 mm credit-card chassis) */}
      <div className="mx-auto w-full max-w-[300px]">
        <div className="relative w-full bg-[#151B26] border border-[#2F3B52] rounded-2xl p-3.5 shadow-sm space-y-3">
          {/* Top Chassis Row: Card Engraving + WS2812C Status LED + Speaker Grill */}
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#8E9BB3]">
              <span>T-ECHO-CARD</span>
              <span className="text-[#5C6B85]">·</span>
              <span className="tabular-nums text-[#E6ECF5]">{config.shortName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                title="WS2812C-2020 Status LED"
                className="w-2 h-2 rounded-full bg-cyan-400"
              />
              {/* MAX98357 8-Ohm Speaker Grill */}
              <div aria-hidden="true" className="grid grid-cols-3 gap-0.5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <span key={idx} className="w-1 h-1 rounded-full bg-[#2A3549]" />
                ))}
              </div>
            </div>
          </div>

          {/* 0.25W 5V Integrated Solar Panel Strip */}
          <div className="bg-[#0B111C] border border-[#23314A] rounded-lg px-2.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#9AA7BD]">
              <Sun className="w-3 h-3 text-amber-400" />
              <span>0.25W SOLAR</span>
            </div>
            <div className="flex-1 mx-2.5 h-3 rounded-sm bg-[#101C30] border border-[#233758] grid grid-cols-6 gap-px p-px">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="bg-[#182B49]" />
              ))}
            </div>
            <span className="text-[10px] font-mono tabular-nums text-amber-300">
              {(solarMv / 1000).toFixed(2)}V
            </span>
          </div>

          {/* 0.42" 72x40 High-Contrast OLED Screen + Side Reset/User Button */}
          <div className="flex items-stretch gap-2.5">
            <div
              key={einkFlashTick}
              data-testid="techo-eink-screen"
              className="flex-1 bg-[#05080E] text-[#D8F3FF] border-2 border-[#253147] rounded-md p-2.5 font-mono flex flex-col justify-between min-h-[112px] select-none"
            >
              <div className="flex items-center justify-between border-b border-[#1E2E42] pb-1 text-[11px] font-bold">
                <span className="text-cyan-300">{config.shortName}</span>
                <span className="tabular-nums text-amber-300">
                  {config.radioConfig.dualStack.enabled ? 'MT+MC' : 'MT'} {batteryPct}%
                </span>
              </div>

              {oledModules.length === 0 ? (
                <div className="py-3 text-center text-[10px] text-[#64748B]">
                  OLED SLEEP (0 ACTIVE)
                </div>
              ) : (
                <div className="space-y-1 text-[10px] leading-tight py-1">
                  {oledModules.map((mod) => {
                    if (mod.id === 'gps_nav') {
                      return (
                        <div key={mod.id} className="flex justify-between tabular-nums">
                          <span className="text-[#7C93B0]">GPS</span>
                          <span>
                            {telemetry.lat.toFixed(2)},{telemetry.lon.toFixed(2)}
                          </span>
                        </div>
                      );
                    }
                    if (mod.id === 'power_telemetry') {
                      return (
                        <div key={mod.id} className="flex justify-between tabular-nums">
                          <span className="text-[#7C93B0]">PWR</span>
                          <span>
                            {schedule.avgCurrentMa}mA {schedule.estimatedHoursRemaining}h
                          </span>
                        </div>
                      );
                    }
                    if (mod.id === 'env_bme280') {
                      return (
                        <div key={mod.id} className="flex justify-between tabular-nums">
                          <span className="text-[#7C93B0]">IMU</span>
                          <span>
                            {telemetry.imuHeadingDeg ?? 214}° · {telemetry.imuAccelG ?? 1.02}G
                          </span>
                        </div>
                      );
                    }
                    if (mod.id === 'lora_mesh') {
                      return (
                        <div key={mod.id} className="flex justify-between tabular-nums">
                          <span className="text-[#7C93B0]">RF</span>
                          <span>
                            S{config.radioConfig.frequencySlot} {schedule.loraTxDbm}dBm
                          </span>
                        </div>
                      );
                    }
                    if (mod.id === 'crypto_inbox') {
                      return (
                        <div key={mod.id} className="truncate">
                          <span className="text-[#7C93B0]">MSG </span>
                          <span>{lastMessage ? `${lastMessage.senderShort}:${lastMessage.plaintext}` : 'None'}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={mod.id} className="flex justify-between tabular-nums">
                        <span className="text-[#7C93B0]">BLE</span>
                        <span>{schedule.bleIntervalMs}ms</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-[#1E2E42] pt-1 flex items-center justify-between text-[9px] text-[#7C93B0] tabular-nums">
                <span>{activityState.toUpperCase()}</span>
                <span>{telemetry.satellites} SAT · {config.radioConfig.frequencyMhz.toFixed(1)}MHz</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between py-1">
              <button
                type="button"
                onClick={onForceRefresh}
                aria-label="Trigger OLED wake refresh"
                className="w-8 h-8 rounded-full border border-[#3B4A66] bg-[#1E2636] hover:bg-[#273247] flex items-center justify-center text-[#A9B7D0] transition-colors cursor-pointer"
                title="User Button: Force 0.42&quot; OLED Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <span className="text-[9px] font-mono text-[#7C8AA3]">72×40</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-[#7C8AA3] px-0.5">
            <span>SSD1306 0.42&quot; OLED · ICM20948</span>
            <span>90×60×9.5mm</span>
          </div>
        </div>
      </div>

      {/* Hardware Test Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onTestRingtone}
          className="px-3 py-2 text-xs font-medium bg-[#18202E] hover:bg-[#212B3D] text-[#E6ECF5] border border-[#2B374E] rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Test I2S Audio</span>
        </button>
        <button
          type="button"
          onClick={onSimulatePacket}
          className="px-3 py-2 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Simulate Rx
        </button>
      </div>
    </section>
  );
};
