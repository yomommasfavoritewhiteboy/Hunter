import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, testFirestoreConnection } from './firebase';
import {
  createCloudMessage,
  loadLocalConfig,
  loadLocalDevices,
  loadLocalMessages,
  removeCloudDevice,
  saveLocalConfig,
  saveLocalDevices,
  saveLocalMessages,
  subscribeCloudConfig,
  subscribeCloudDevices,
  subscribeCloudMessages,
  syncUserProfile,
  upsertCloudConfig,
  upsertCloudDevice,
} from './services/syncService';
import type {
  ActivityState,
  FirmwareConfig,
  MeshMessage,
  SyncedDevice,
  TelemetryPoint,
} from './types/techo';
import { playRtttlPreview } from './utils/audioPlayer';
import { encryptMeshtasticPayload } from './utils/cryptoMesh';
import {
  createDefaultFirmwareConfig,
  createInitialMessages,
  DEFAULT_SYNCED_DEVICES,
} from './utils/defaultConfig';
import { computeAdaptivePowerSchedule } from './utils/powerEngine';
import {
  createInitialTelemetrySeries,
  INITIAL_NEIGHBORS,
  stepTelemetryPoint,
} from './utils/telemetrySim';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { PowerAndRadioConsole } from './components/PowerAndRadioConsole';
import { MobileSyncConsole } from './components/MobileSyncConsole';
import { FirmwareWorkbench } from './components/FirmwareWorkbench';

type ActiveView = 'telemetry' | 'power' | 'mobile' | 'firmware';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('telemetry');

  const [config, setConfig] = useState<FirmwareConfig>(() => {
    return loadLocalConfig() ?? createDefaultFirmwareConfig();
  });

  const [messages, setMessages] = useState<MeshMessage[]>(() => {
    const saved = loadLocalMessages();
    if (saved && saved.length > 0) return saved;
    return createInitialMessages(loadLocalConfig() ?? createDefaultFirmwareConfig());
  });

  const [devices, setDevices] = useState<SyncedDevice[]>(() => {
    return loadLocalDevices() ?? DEFAULT_SYNCED_DEVICES;
  });

  const [batteryPct, setBatteryPct] = useState<number>(78);
  const [activityState, setActivityState] = useState<ActivityState>('walking');
  const [series, setSeries] = useState<TelemetryPoint[]>(() => createInitialTelemetrySeries(78));
  const [einkFlashTick, setEinkFlashTick] = useState<number>(0);

  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('Local multi-tab sync active');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const channelRef = useRef<BroadcastChannel | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const schedule = useMemo(
    () =>
      computeAdaptivePowerSchedule(
        batteryPct,
        activityState,
        config.powerMode,
        config.powerPolicy,
        config.radioConfig,
        config.bleConfig.enabled
      ),
    [batteryPct, activityState, config.powerMode, config.powerPolicy, config.radioConfig, config.bleConfig.enabled]
  );

  // Boot Firestore connection test + BroadcastChannel cross-tab sync
  useEffect(() => {
    void testFirestoreConnection();

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('echomesh_techo_sync');
      channelRef.current = bc;
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'CONFIG_UPDATE' && ev.data.payload) {
          setConfig(ev.data.payload as FirmwareConfig);
        } else if (ev.data?.type === 'MSG_UPDATE' && ev.data.payload) {
          setMessages(ev.data.payload as MeshMessage[]);
        }
      };
      return () => bc.close();
    }
  }, []);

  // Auth state & Firestore real-time subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setSyncStatus('Local multi-tab sync active');
        return;
      }

      setSyncStatus('Connecting Firestore cloud sync...');
      setSyncError(null);
      try {
        await syncUserProfile(nextUser);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Unable to sync profile');
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubConfig = subscribeCloudConfig(
      user.uid,
      config.id,
      (cloudCfg) => {
        setConfig((prev) => (cloudCfg.revision >= prev.revision ? cloudCfg : prev));
        saveLocalConfig(cloudCfg);
        setSyncStatus('Cloud synced across devices');
      },
      (err) => {
        setSyncError(err.message);
      }
    );

    const unsubDevices = subscribeCloudDevices(
      user.uid,
      (cloudDevs) => {
        if (cloudDevs.length > 0) {
          setDevices(cloudDevs);
          saveLocalDevices(cloudDevs);
        }
      },
      (err) => {
        setSyncError(err.message);
      }
    );

    const unsubMsgs = subscribeCloudMessages(
      user.uid,
      (cloudMsgs) => {
        if (cloudMsgs.length > 0) {
          setMessages(cloudMsgs);
          saveLocalMessages(cloudMsgs);
        }
      },
      (err) => {
        setSyncError(err.message);
      }
    );

    return () => {
      unsubConfig();
      unsubDevices();
      unsubMsgs();
    };
  }, [user, config.id]);

  // Live sensor telemetry stream
  useEffect(() => {
    const timer = setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1];
        const nextPt = stepTelemetryPoint(last, batteryPct, activityState, schedule);
        return [...prev.slice(1), nextPt];
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [batteryPct, activityState, schedule]);

  const handleUpdateConfig = useCallback(
    (updater: (prev: FirmwareConfig) => FirmwareConfig) => {
      setConfig((prev) => {
        const updated = updater(prev);
        const next: FirmwareConfig = {
          ...updated,
          revision: prev.revision + 1,
          updatedAtIso: new Date().toISOString(),
        };
        saveLocalConfig(next);
        channelRef.current?.postMessage({ type: 'CONFIG_UPDATE', payload: next });
        if (user) {
          setSyncStatus('Syncing changes...');
          void upsertCloudConfig(user.uid, next)
            .then(() => setSyncStatus('Cloud synced across devices'))
            .catch((err) => setSyncError(err instanceof Error ? err.message : 'Sync failed'));
        }
        return next;
      });
    },
    [user]
  );

  const handleTestRingtone = useCallback(() => {
    const res = playRtttlPreview(config.ringtoneConfig.customRtttl, config.ringtoneConfig.volumePct);
    if (!res.started) {
      showToast(res.error ?? 'Check RTTTL syntax before testing audio.');
    } else {
      showToast(`Playing "${config.ringtoneConfig.activePresetId}" T-Echo-Card audio alert`);
    }
  }, [config.ringtoneConfig.customRtttl, config.ringtoneConfig.volumePct, config.ringtoneConfig.activePresetId, showToast]);

  const handleSendMessage = useCallback(
    (channelIndex: number, text: string) => {
      const ch = config.channels.find((c) => c.index === channelIndex) ?? config.channels[0];
      const packetId = Math.floor(Date.now() % 1000000);
      const ciphertextHex = encryptMeshtasticPayload(text, ch.pskBase64, packetId);
      const newMsg: MeshMessage = {
        id: `msg_${Date.now()}`,
        channelIndex: ch.index,
        senderShort: config.shortName,
        plaintext: text,
        ciphertextHex,
        hopLimit: config.radioConfig.hopLimit,
        snrDb: series[series.length - 1]?.snrDb ?? 8.2,
        createdAtIso: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, newMsg].slice(-30);
        saveLocalMessages(next);
        channelRef.current?.postMessage({ type: 'MSG_UPDATE', payload: next });
        return next;
      });
      if (user) {
        void createCloudMessage(user.uid, newMsg).catch((err) =>
          setSyncError(err instanceof Error ? err.message : 'Message sync failed')
        );
      }
    },
    [config.channels, config.shortName, config.radioConfig.hopLimit, series, user]
  );

  const handleSimulatePacket = useCallback(() => {
    const ch = config.channels[0];
    const incomingText = `AVL Beacon: Slot ${config.radioConfig.frequencySlot} (${config.radioConfig.frequencyMhz.toFixed(3)} MHz) · ${config.radioConfig.dualStack.enabled ? 'MeshCore + Meshtastic' : 'Meshtastic'} OK`;
    const newMsg: MeshMessage = {
      id: `rx_${Date.now()}`,
      channelIndex: ch.index,
      senderShort: 'PISG',
      plaintext: incomingText,
      ciphertextHex: encryptMeshtasticPayload(incomingText, ch.pskBase64, Date.now() % 999999),
      hopLimit: 3,
      snrDb: 9.8,
      createdAtIso: new Date().toISOString(),
    };
    setMessages((prev) => {
      const next = [...prev, newMsg].slice(-30);
      saveLocalMessages(next);
      return next;
    });
    setEinkFlashTick((t) => t + 1);
    playRtttlPreview(config.ringtoneConfig.customRtttl, config.ringtoneConfig.volumePct);
    showToast('Simulated incoming encrypted packet & triggered I2S ringtone');
  }, [config, showToast]);

  const handleRestoreModules = useCallback(() => {
    const defaults = createDefaultFirmwareConfig().dashboardLayout;
    handleUpdateConfig((prev) => ({
      ...prev,
      dashboardLayout: defaults,
    }));
  }, [handleUpdateConfig]);

  const handleSignInGoogle = async () => {
    setSyncError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await syncUserProfile(cred.user);
        await upsertCloudConfig(cred.user.uid, config);
        for (const dev of devices) {
          await upsertCloudDevice(cred.user.uid, dev);
        }
        showToast('Google Cloud Sync connected');
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Google sign-in cancelled or failed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    showToast('Signed out of cloud sync');
  };

  const handleForceSync = async () => {
    if (!user) return;
    setSyncStatus('Pushing configuration to Firestore...');
    try {
      await upsertCloudConfig(user.uid, config);
      setSyncStatus('Cloud synced across devices');
      showToast('All paired devices synchronized');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Cloud push failed');
    }
  };

  const handleAddDevice = (label: string, platform: SyncedDevice['platform']) => {
    const newDev: SyncedDevice = {
      id: `dev_${Date.now()}`,
      label,
      platform,
      activeConfigId: config.id,
      lastSeenIso: new Date().toISOString(),
    };
    setDevices((prev) => {
      const next = [...prev, newDev];
      saveLocalDevices(next);
      return next;
    });
    if (user) {
      void upsertCloudDevice(user.uid, newDev).catch((err) =>
        setSyncError(err instanceof Error ? err.message : 'Failed to register device')
      );
    }
    showToast(`Paired "${label}"`);
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveLocalDevices(next);
      return next;
    });
    if (user) {
      void removeCloudDevice(user.uid, id).catch((err) =>
        setSyncError(err instanceof Error ? err.message : 'Failed to remove device')
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#090C12] text-[#E6ECF5] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-[#1D2638] bg-[#0B0E16]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('telemetry');
            }}
            className="text-base sm:text-lg font-display font-bold tracking-tight text-[#E6ECF5] whitespace-nowrap shrink-0"
          >
            EchoMesh Studio
          </a>

          <nav aria-label="Primary sections" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {[
              { id: 'telemetry' as ActiveView, label: 'Telemetry' },
              { id: 'power' as ActiveView, label: 'Power & Radio' },
              { id: 'mobile' as ActiveView, label: 'Mobile Sync' },
              { id: 'firmware' as ActiveView, label: 'Firmware' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeView === item.id
                    ? 'border-amber-400 text-[#E6ECF5]'
                    : 'border-transparent text-[#8E9BB3] hover:text-[#E6ECF5]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('firmware')}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#090C12] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Export Firmware
            </button>
          </div>
        </div>

        {/* Mobile Secondary View Switcher */}
        <nav
          aria-label="Mobile sections"
          className="md:hidden border-t border-[#1A2232] px-3 py-1.5 flex items-center justify-between gap-1 overflow-x-auto"
        >
          {[
            { id: 'telemetry' as ActiveView, label: 'Telemetry' },
            { id: 'power' as ActiveView, label: 'Power & RF' },
            { id: 'mobile' as ActiveView, label: 'Mobile Sync' },
            { id: 'firmware' as ActiveView, label: 'Firmware' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === item.id
                  ? 'bg-[#172133] text-amber-300'
                  : 'text-[#8E9BB3]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeView === 'telemetry' && (
          <TelemetryDashboard
            config={config}
            series={series}
            neighbors={INITIAL_NEIGHBORS}
            messages={messages}
            schedule={schedule}
            batteryPct={batteryPct}
            activityState={activityState}
            einkFlashTick={einkFlashTick}
            onTestRingtone={handleTestRingtone}
            onSimulatePacket={handleSimulatePacket}
            onForceEinkRefresh={() => setEinkFlashTick((t) => t + 1)}
            onSendMessage={handleSendMessage}
            onUpdateConfig={handleUpdateConfig}
            onOpenMobileSync={() => setActiveView('mobile')}
            onRestoreModules={handleRestoreModules}
          />
        )}

        {activeView === 'power' && (
          <PowerAndRadioConsole
            config={config}
            batteryPct={batteryPct}
            activityState={activityState}
            schedule={schedule}
            onChangeBatteryPct={setBatteryPct}
            onChangeActivityState={setActivityState}
            onUpdateConfig={handleUpdateConfig}
          />
        )}

        {activeView === 'mobile' && (
          <MobileSyncConsole
            config={config}
            devices={devices}
            user={user}
            syncStatus={syncStatus}
            syncError={syncError}
            onUpdateConfig={handleUpdateConfig}
            onTestRingtone={handleTestRingtone}
            onSignInGoogle={handleSignInGoogle}
            onSignOut={handleSignOut}
            onForceSync={handleForceSync}
            onAddDevice={handleAddDevice}
            onRemoveDevice={handleRemoveDevice}
          />
        )}

        {activeView === 'firmware' && <FirmwareWorkbench config={config} />}
      </main>

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 bg-[#161E2C] border border-[#2F3E58] text-[#E6ECF5] text-xs px-4 py-2.5 rounded-lg shadow-lg"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
