import type {
  ActivityState,
  AdaptivePowerSchedule,
  PowerMode,
  PowerPolicy,
  RadioConfig,
} from '../types/techo';

export const POWER_PRESETS: Record<Exclude<PowerMode, 'custom'>, PowerPolicy> = {
  expedition: {
    batteryCapacityMah: 850,
    lowBatteryThresholdPct: 25,
    criticalBatteryThresholdPct: 12,
    gpsStationarySec: 900,
    gpsActiveSec: 60,
    gpsLowBattMultiplier: 3,
    bleAdvertisingIntervalMs: 1285,
    bleSleepAfterIdleSec: 90,
    einkPartialRefreshSec: 30,
    einkFullCleanCycleMins: 60,
    deepSleepEnabled: true,
    adaptiveTxScaling: true,
    motionWakeEnabled: true,
  },
  balanced: {
    batteryCapacityMah: 850,
    lowBatteryThresholdPct: 20,
    criticalBatteryThresholdPct: 10,
    gpsStationarySec: 420,
    gpsActiveSec: 30,
    gpsLowBattMultiplier: 2.5,
    bleAdvertisingIntervalMs: 546,
    bleSleepAfterIdleSec: 180,
    einkPartialRefreshSec: 15,
    einkFullCleanCycleMins: 30,
    deepSleepEnabled: true,
    adaptiveTxScaling: true,
    motionWakeEnabled: true,
  },
  performance: {
    batteryCapacityMah: 850,
    lowBatteryThresholdPct: 15,
    criticalBatteryThresholdPct: 5,
    gpsStationarySec: 120,
    gpsActiveSec: 10,
    gpsLowBattMultiplier: 2,
    bleAdvertisingIntervalMs: 152,
    bleSleepAfterIdleSec: 600,
    einkPartialRefreshSec: 5,
    einkFullCleanCycleMins: 15,
    deepSleepEnabled: false,
    adaptiveTxScaling: false,
    motionWakeEnabled: true,
  },
};

export function applyPowerPreset(mode: Exclude<PowerMode, 'custom'>): PowerPolicy {
  return { ...POWER_PRESETS[mode] };
}

export function computeAdaptivePowerSchedule(
  batteryPct: number,
  activityState: ActivityState,
  powerMode: PowerMode,
  policy: PowerPolicy,
  radioConfig: RadioConfig,
  bleEnabled: boolean = true
): AdaptivePowerSchedule {
  const clampedBatt = Math.max(1, Math.min(100, Math.round(batteryPct)));
  const isCritical = clampedBatt <= policy.criticalBatteryThresholdPct;
  const isLow = clampedBatt <= policy.lowBatteryThresholdPct && !isCritical;
  const isSos = activityState === 'sos';

  let tier: AdaptivePowerSchedule['tier'] = 'full';
  let tierLabel = 'Nominal Duty';

  if (isSos) {
    tier = 'sos-override';
    tierLabel = 'SOS Emergency Override';
  } else if (isCritical) {
    tier = 'survival';
    tierLabel = 'Critical Survival Reserve';
  } else if (isLow || activityState === 'stationary') {
    tier = 'eco';
    tierLabel = isLow ? 'Low-Battery Eco Throttle' : 'Stationary Sleep Throttle';
  } else if (powerMode === 'expedition') {
    tier = 'eco';
    tierLabel = 'Expedition Field Conservation';
  }

  // 1. GPS Polling Interval (L76K GNSS)
  let gpsIntervalSec: number;
  let gpsMode: AdaptivePowerSchedule['gpsMode'];

  if (!radioConfig.gpsEnabled) {
    gpsIntervalSec = 0;
    gpsMode = 'Deep Duty';
  } else if (isSos) {
    gpsIntervalSec = 5;
    gpsMode = 'Continuous SOS';
  } else if (isCritical) {
    gpsIntervalSec = Math.round(policy.gpsStationarySec * policy.gpsLowBattMultiplier);
    gpsMode = 'Deep Duty';
  } else if (activityState === 'stationary') {
    gpsIntervalSec = isLow
      ? Math.round(policy.gpsStationarySec * policy.gpsLowBattMultiplier)
      : policy.gpsStationarySec;
    gpsMode = 'Periodic Sleep';
  } else if (activityState === 'walking') {
    const base = Math.round((policy.gpsActiveSec + policy.gpsStationarySec) * 0.25);
    gpsIntervalSec = isLow ? Math.round(base * policy.gpsLowBattMultiplier) : Math.max(15, base);
    gpsMode = isLow ? 'Periodic Sleep' : 'Active Fix';
  } else {
    // trail
    gpsIntervalSec = isLow
      ? Math.round(policy.gpsActiveSec * policy.gpsLowBattMultiplier)
      : policy.gpsActiveSec;
    gpsMode = isLow ? 'Periodic Sleep' : 'Active Fix';
  }

  // 2. BLE 5.0 Connection / Advertising Interval (nRF52840 SoftDevice S140)
  let bleIntervalMs: number;
  let bleState: AdaptivePowerSchedule['bleState'];

  if (!bleEnabled) {
    bleIntervalMs = 0;
    bleState = 'Periodic Wake';
  } else if (isSos) {
    bleIntervalMs = 100;
    bleState = 'Connected High-Speed';
  } else if (isCritical) {
    bleIntervalMs = Math.min(4000, Math.round(policy.bleAdvertisingIntervalMs * 2.5));
    bleState = 'Periodic Wake';
  } else if (isLow || activityState === 'stationary') {
    bleIntervalMs = Math.min(2500, Math.round(policy.bleAdvertisingIntervalMs * 1.6));
    bleState = 'Low-Power Advertising';
  } else {
    bleIntervalMs = policy.bleAdvertisingIntervalMs;
    bleState = bleIntervalMs <= 250 ? 'Connected High-Speed' : 'Low-Power Advertising';
  }

  // 3. 0.42" 72x40 OLED Display Wake/Refresh Interval (SSD1306/SSD1315)
  let einkRefreshSec: number;
  let einkMode: AdaptivePowerSchedule['einkMode'];

  if (isSos) {
    einkRefreshSec = 5;
    einkMode = 'Live Partial';
  } else if (isCritical) {
    einkRefreshSec = Math.max(120, policy.einkPartialRefreshSec * 4);
    einkMode = 'Event-Only Wake';
  } else if (isLow) {
    einkRefreshSec = Math.max(45, Math.round(policy.einkPartialRefreshSec * 2.5));
    einkMode = 'Throttled Partial';
  } else if (activityState === 'stationary') {
    einkRefreshSec = Math.max(30, policy.einkPartialRefreshSec * 2);
    einkMode = 'Throttled Partial';
  } else {
    einkRefreshSec = policy.einkPartialRefreshSec;
    einkMode = einkRefreshSec <= 15 ? 'Live Partial' : 'Throttled Partial';
  }

  // 4. LoRa SX1262 Adaptive TX Power
  let loraTxDbm = radioConfig.txPowerDbm;
  if (policy.adaptiveTxScaling && !isSos) {
    if (isCritical) {
      loraTxDbm = Math.min(radioConfig.txPowerDbm, 14);
    } else if (isLow) {
      loraTxDbm = Math.min(radioConfig.txPowerDbm, 17);
    }
  } else if (isSos) {
    loraTxDbm = Math.max(radioConfig.txPowerDbm, 22);
  }

  // 5. T-Echo-Card Hardware Current Model (nRF52840 + SX1262 + L76K + 0.42" OLED + ICM20948)
  const mcuMa = policy.deepSleepEnabled && !isSos ? (activityState === 'stationary' ? 0.35 : 0.85) : 2.1;

  // L76K active acquisition ~25mA for ~6s per fix, backup 0.015mA
  const gpsDuty = !radioConfig.gpsEnabled || gpsIntervalSec === 0
    ? 0
    : isSos
      ? 0.85
      : Math.min(1, 5.5 / Math.max(5, gpsIntervalSec));
  const gpsMa = Number((0.02 + gpsDuty * 24.5).toFixed(2));

  // SX1262 RX duty-cycled + periodic beacon TX (+0.45mA CAD retune overhead when Dual-Stack TDM is active)
  const txBoostFactor = Math.pow(10, (loraTxDbm - 14) / 20);
  const dualStackOverheadMa = radioConfig.dualStack.enabled ? 0.45 : 0;
  const loraRxMa = (policy.deepSleepEnabled ? 1.85 : 4.6) + dualStackOverheadMa;
  const loraTxDutyMa = 0.45 * txBoostFactor;
  const loraMa = Number((loraRxMa + loraTxDutyMa).toFixed(2));

  // BLE SoftDevice S140 current scales inversely with advertising interval
  const bleMa = !bleEnabled
    ? 0
    : Number((0.08 + Math.min(1.8, 120 / Math.max(50, bleIntervalMs))).toFixed(2));

  // 0.42" 72x40 OLED draws ~11mA while awake (~0.9s burst per duty-cycled refresh)
  const einkMa = Number(((11 * 0.9) / Math.max(5, einkRefreshSec)).toFixed(2));

  const avgCurrentMa = Number((mcuMa + gpsMa + loraMa + bleMa + einkMa).toFixed(2));
  const usableMah = (policy.batteryCapacityMah * clampedBatt) / 100;
  const estimatedHoursRemaining = Number((usableMah / Math.max(0.5, avgCurrentMa)).toFixed(1));

  // Unmanaged continuous baseline: L76K 1Hz (~25mA) + continuous RX (4.6mA) + active MCU (2.2mA) + 100ms BLE (1.3mA) + continuous OLED (1.98mA)
  const baselineMa = (radioConfig.gpsEnabled ? 25.0 : 0) + 4.6 + 2.2 + (bleEnabled ? 1.3 : 0) + 1.98;
  const baselineHoursRemaining = Number((usableMah / Math.max(1, baselineMa)).toFixed(1));
  const savingsPct = Math.max(
    0,
    Math.min(95, Math.round(((baselineMa - avgCurrentMa) / Math.max(0.1, baselineMa)) * 100))
  );

  const rationale: string[] = [];
  if (isSos) {
    rationale.push('SOS override locks L76K GNSS to 5s fixes and boosts SX1262 output to 22 dBm.');
  } else {
    if (!radioConfig.gpsEnabled) {
      rationale.push('L76K GNSS receiver powered down; relying on last known static beacon.');
    } else {
      rationale.push(`L76K GNSS duty-cycled to ${gpsIntervalSec}s (${gpsMode}) for ${activityState} motion state.`);
    }
    if (isCritical) {
      rationale.push(`Battery <= ${policy.criticalBatteryThresholdPct}% triggers survival mode: BLE wakes periodically and 0.42" OLED wakes only on packet events.`);
    } else if (isLow) {
      rationale.push(`Battery <= ${policy.lowBatteryThresholdPct}% multiplies GPS polling by ${policy.gpsLowBattMultiplier}x and caps LoRa TX at ${loraTxDbm} dBm.`);
    }
  }
  if (bleEnabled && !isSos) {
    rationale.push(`nRF52840 BLE 5.0 advertising scaled to ${bleIntervalMs}ms (${bleState}).`);
  }

  return {
    tier,
    tierLabel,
    gpsIntervalSec,
    gpsMode,
    bleIntervalMs,
    bleState,
    einkRefreshSec,
    einkMode,
    loraTxDbm,
    breakdownMa: {
      mcu: Number(mcuMa.toFixed(2)),
      gps: gpsMa,
      lora: loraMa,
      ble: bleMa,
      eink: einkMa,
    },
    avgCurrentMa,
    estimatedHoursRemaining,
    baselineHoursRemaining,
    savingsPct,
    rationale,
  };
}

export interface RuntimeCurvePoint {
  batteryPct: number;
  avgCurrentMa: number;
  gpsIntervalSec: number;
  einkRefreshSec: number;
  hoursRemaining: number;
}

export function generateRuntimeCurve(
  powerMode: PowerMode,
  policy: PowerPolicy,
  radioConfig: RadioConfig,
  activityState: ActivityState,
  bleEnabled: boolean = true
): RuntimeCurvePoint[] {
  const points: RuntimeCurvePoint[] = [];
  for (let pct = 100; pct >= 5; pct -= 5) {
    const sched = computeAdaptivePowerSchedule(pct, activityState, powerMode, policy, radioConfig, bleEnabled);
    points.push({
      batteryPct: pct,
      avgCurrentMa: sched.avgCurrentMa,
      gpsIntervalSec: sched.gpsIntervalSec,
      einkRefreshSec: sched.einkRefreshSec,
      hoursRemaining: sched.estimatedHoursRemaining,
    });
  }
  return points;
}
