import type {
  ActivityState,
  AdaptivePowerSchedule,
  MeshNeighbor,
  TelemetryPoint,
} from '../types/techo';

// Local Asheville, NC / Western North Carolina Blue Ridge mesh neighbors
export const INITIAL_NEIGHBORS: MeshNeighbor[] = [
  {
    id: '!9a34c102',
    shortName: 'PISG',
    longName: 'Mt. Pisgah Ridge Relay',
    snrDb: 10.2,
    rssiDbm: -76,
    hops: 0,
    distanceKm: 19.4,
    bearingDeg: 224,
    batteryPct: 94,
    lastHeardSec: 9,
  },
  {
    id: '!7f10e8b4',
    shortName: 'AVL1',
    longName: 'Downtown Asheville Hub',
    snrDb: 7.4,
    rssiDbm: -85,
    hops: 0,
    distanceKm: 2.1,
    bearingDeg: 58,
    batteryPct: 100,
    lastHeardSec: 18,
  },
  {
    id: '!44b2a091',
    shortName: 'CRAG',
    longName: 'Craggy Gardens Repeater',
    snrDb: 3.1,
    rssiDbm: -99,
    hops: 1,
    distanceKm: 21.6,
    bearingDeg: 44,
    batteryPct: 82,
    lastHeardSec: 47,
  },
  {
    id: '!1c90f32e',
    shortName: 'BRPK',
    longName: 'Blue Ridge Pkwy Mobile',
    snrDb: -1.8,
    rssiDbm: -108,
    hops: 2,
    distanceKm: 13.7,
    bearingDeg: 142,
    batteryPct: 68,
    lastHeardSec: 84,
  },
];

export function createInitialTelemetrySeries(batteryPct: number): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const now = Date.now();
  // Asheville, NC (35.5951 N, -82.5515 W, ~650m elevation)
  for (let i = 15; i >= 0; i--) {
    const t = new Date(now - i * 30_000);
    const label = t.toISOString().slice(11, 19);
    const wave = Math.sin(i * 0.45);
    const bPct = Math.max(1, Math.min(100, batteryPct + Math.round(i * 0.1)));
    points.push({
      timestamp: label,
      batteryPct: bPct,
      voltageMv: Math.round(3300 + (bPct / 100) * 900),
      currentMa: Number((3.4 + wave * 0.45).toFixed(2)),
      tempC: Number((16.8 + wave * 0.5).toFixed(1)),
      humidityPct: Math.round(54 - wave * 3),
      pressureHpa: Number((938.4 + Math.cos(i * 0.3) * 0.7).toFixed(1)),
      imuHeadingDeg: Math.round((214 + wave * 12 + 360) % 360),
      imuAccelG: Number((1.01 + Math.abs(wave) * 0.14).toFixed(2)),
      solarMv: Math.round(4820 + Math.cos(i * 0.4) * 240),
      snrDb: Number((8.6 + wave * 1.4).toFixed(1)),
      rssiDbm: Math.round(-80 + wave * 4),
      lat: Number((35.5951 + (15 - i) * 0.00007).toFixed(5)),
      lon: Number((-82.5515 + (15 - i) * 0.00009).toFixed(5)),
      altitudeM: Math.round(658 + wave * 3),
      satellites: 11,
      hdop: Number((0.91 + Math.abs(wave) * 0.14).toFixed(2)),
    });
  }
  return points;
}

export function stepTelemetryPoint(
  prev: TelemetryPoint,
  batteryPct: number,
  activityState: ActivityState,
  schedule: AdaptivePowerSchedule
): TelemetryPoint {
  const now = new Date();
  const label = now.toISOString().slice(11, 19);
  const tSec = now.getSeconds() + now.getMilliseconds() / 1000;
  const jitter = Math.sin(tSec * 0.7);
  const moveStep = activityState === 'stationary' ? 0 : activityState === 'walking' ? 0.00004 : 0.00011;

  return {
    timestamp: label,
    batteryPct,
    voltageMv: Math.round(3300 + (batteryPct / 100) * 900),
    currentMa: Number((schedule.avgCurrentMa + jitter * 0.18).toFixed(2)),
    tempC: Number((prev.tempC + jitter * 0.12).toFixed(1)),
    humidityPct: Math.max(15, Math.min(95, Math.round(prev.humidityPct - jitter * 0.8))),
    pressureHpa: Number((prev.pressureHpa + Math.cos(tSec * 0.4) * 0.15).toFixed(1)),
    imuHeadingDeg: Math.round(((prev.imuHeadingDeg ?? 214) + jitter * 4 + 360) % 360),
    imuAccelG: Number((activityState === 'stationary' ? 1.0 : 1.03 + Math.abs(jitter) * 0.18).toFixed(2)),
    solarMv: Math.round(4780 + Math.cos(tSec * 0.3) * 260),
    snrDb: Number(Math.max(-12, Math.min(14, prev.snrDb + jitter * 0.45)).toFixed(1)),
    rssiDbm: Math.round(Math.max(-120, Math.min(-60, prev.rssiDbm + jitter * 1.8))),
    lat: Number((prev.lat + moveStep).toFixed(5)),
    lon: Number((prev.lon + moveStep * 1.15).toFixed(5)),
    altitudeM: Math.round(prev.altitudeM + (activityState === 'trail' ? jitter * 2 : 0)),
    satellites: schedule.gpsIntervalSec === 0 ? 0 : activityState === 'stationary' ? 10 : 12,
    hdop: schedule.gpsIntervalSec === 0 ? 99.9 : Number((0.88 + Math.abs(jitter) * 0.18).toFixed(2)),
  };
}
