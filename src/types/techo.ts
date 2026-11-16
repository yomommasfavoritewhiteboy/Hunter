export type PowerMode = 'expedition' | 'balanced' | 'performance' | 'custom';

export type ActivityState = 'stationary' | 'walking' | 'trail' | 'sos';

export type RegionCode = 'US' | 'EU_868' | 'EU_433' | 'ANZ' | 'JP' | 'KR';

export type ModemPreset =
  | 'LONG_FAST'
  | 'LONG_SLOW'
  | 'VERY_LONG_SLOW'
  | 'MEDIUM_FAST'
  | 'SHORT_FAST';

export type DashboardModuleId =
  | 'gps_nav'
  | 'env_bme280'
  | 'power_telemetry'
  | 'lora_mesh'
  | 'crypto_inbox'
  | 'ble_link';

export type VibratePattern = 'pulse' | 'double' | 'sos' | 'off';

export interface PowerPolicy {
  batteryCapacityMah: number;
  lowBatteryThresholdPct: number;
  criticalBatteryThresholdPct: number;
  gpsStationarySec: number;
  gpsActiveSec: number;
  gpsLowBattMultiplier: number;
  bleAdvertisingIntervalMs: number;
  bleSleepAfterIdleSec: number;
  einkPartialRefreshSec: number;
  einkFullCleanCycleMins: number;
  deepSleepEnabled: boolean;
  adaptiveTxScaling: boolean;
  motionWakeEnabled: boolean;
}

export interface AdaptivePowerSchedule {
  tier: 'full' | 'eco' | 'survival' | 'sos-override';
  tierLabel: string;
  gpsIntervalSec: number;
  gpsMode: 'Continuous SOS' | 'Active Fix' | 'Periodic Sleep' | 'Deep Duty';
  bleIntervalMs: number;
  bleState: 'Connected High-Speed' | 'Low-Power Advertising' | 'Periodic Wake';
  einkRefreshSec: number;
  einkMode: 'Live Partial' | 'Throttled Partial' | 'Event-Only Wake';
  loraTxDbm: number;
  breakdownMa: {
    mcu: number;
    gps: number;
    lora: number;
    ble: number;
    eink: number;
  };
  avgCurrentMa: number;
  estimatedHoursRemaining: number;
  baselineHoursRemaining: number;
  savingsPct: number;
  rationale: string[];
}

export interface DualStackConfig {
  enabled: boolean;
  meshtasticSharePct: number;
  meshcoreRole: 'companion' | 'repeater' | 'room-server';
  meshcoreFreqMhz: number;
  meshcoreSyncWord: string;
  crossBridgeEnabled: boolean;
}

export interface RadioConfig {
  region: RegionCode;
  modemPreset: ModemPreset;
  frequencySlot: number;
  frequencyMhz: number;
  autoLocalChannel: boolean;
  localAreaLabel: string;
  hopLimit: number;
  txPowerDbm: number;
  gpsEnabled: boolean;
  smartPositionEnabled: boolean;
  bme280Enabled: boolean;
  dualStack: DualStackConfig;
}

export interface BleConfig {
  enabled: boolean;
  pinCode: string;
  pairingMode: 'FIXED_PIN' | 'RANDOM_PIN' | 'NO_PIN';
  lowPowerAdv: boolean;
  mtuSize: number;
}

export interface RingtoneConfig {
  activePresetId: string;
  customRtttl: string;
  volumePct: number;
  vibratePattern: VibratePattern;
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
}

export interface DashboardModuleConfig {
  id: DashboardModuleId;
  title: string;
  subtitle: string;
  enabled: boolean;
  size: 'compact' | 'expanded';
  order: number;
  refreshRateSec: number;
  showOnEInk: boolean;
}

export interface EncryptedChannel {
  index: number;
  name: string;
  pskBase64: string;
  encryption: 'AES-256-CTR' | 'AES-128-CTR';
  uplinkEnabled: boolean;
  downlinkEnabled: boolean;
}

export interface MeshMessage {
  id: string;
  channelIndex: number;
  senderShort: string;
  plaintext: string;
  ciphertextHex: string;
  hopLimit: number;
  snrDb: number;
  createdAtIso: string;
}

export interface FirmwareConfig {
  id: string;
  deviceName: string;
  shortName: string;
  powerMode: PowerMode;
  powerPolicy: PowerPolicy;
  radioConfig: RadioConfig;
  bleConfig: BleConfig;
  ringtoneConfig: RingtoneConfig;
  dashboardLayout: DashboardModuleConfig[];
  channels: EncryptedChannel[];
  lastSyncedDevice: string;
  revision: number;
  updatedAtIso: string;
}

export interface SyncedDevice {
  id: string;
  label: string;
  platform: 'desktop' | 'ios' | 'android' | 'techo-usb';
  activeConfigId: string;
  lastSeenIso: string;
}

export interface TelemetryPoint {
  timestamp: string;
  batteryPct: number;
  voltageMv: number;
  currentMa: number;
  tempC: number;
  humidityPct: number;
  pressureHpa: number;
  imuHeadingDeg?: number;
  imuAccelG?: number;
  solarMv?: number;
  snrDb: number;
  rssiDbm: number;
  lat: number;
  lon: number;
  altitudeM: number;
  satellites: number;
  hdop: number;
}

export interface MeshNeighbor {
  id: string;
  shortName: string;
  longName: string;
  snrDb: number;
  rssiDbm: number;
  hops: number;
  distanceKm: number;
  bearingDeg: number;
  batteryPct: number;
  lastHeardSec: number;
}

export interface GeneratedFirmwareFile {
  path: string;
  language: 'cpp' | 'ini' | 'json';
  summary: string;
  content: string;
}
