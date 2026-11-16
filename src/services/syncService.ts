import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { FirmwareConfig, MeshMessage, SyncedDevice } from '../types/techo';

const LOCAL_CONFIG_KEY = 'echomesh_techo_config_v1';
const LOCAL_MESSAGES_KEY = 'echomesh_techo_messages_v1';
const LOCAL_DEVICES_KEY = 'echomesh_techo_devices_v1';

export function loadLocalConfig(): FirmwareConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FirmwareConfig;
  } catch {
    return null;
  }
}

export function saveLocalConfig(config: FirmwareConfig): void {
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

export function loadLocalMessages(): MeshMessage[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_MESSAGES_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MeshMessage[];
  } catch {
    return null;
  }
}

export function saveLocalMessages(messages: MeshMessage[]): void {
  try {
    localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

export function loadLocalDevices(): SyncedDevice[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_DEVICES_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SyncedDevice[];
  } catch {
    return null;
  }
}

export function saveLocalDevices(devices: SyncedDevice[]): void {
  try {
    localStorage.setItem(LOCAL_DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // ignore
  }
}

export async function syncUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}/private/profile`;
  try {
    await setDoc(
      doc(db, 'users', user.uid, 'private', 'profile'),
      {
        uid: user.uid,
        email: (user.email || 'user@echomesh.local').slice(0, 254),
        displayName: (user.displayName || 'Field Operator').slice(0, 80),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertCloudConfig(userId: string, config: FirmwareConfig): Promise<void> {
  const configId = config.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'techo-avl-primary';
  const path = `users/${userId}/configs/${configId}`;
  const ref = doc(db, 'users', userId, 'configs', configId);

  try {
    const existingSnap = await getDoc(ref);
    const sanitizedLayout = config.dashboardLayout.slice(0, 12);
    const sanitizedChannels = config.channels.slice(0, 8);

    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: configId,
        ownerId: userId,
        deviceName: config.deviceName.slice(0, 48) || 'AVL Echo',
        shortName: config.shortName.slice(0, 4) || 'AVLA',
        powerMode: config.powerMode,
        powerPolicy: config.powerPolicy,
        radioConfig: config.radioConfig,
        bleConfig: config.bleConfig,
        ringtoneConfig: config.ringtoneConfig,
        dashboardLayout: sanitizedLayout,
        channels: sanitizedChannels,
        lastSyncedDevice: config.lastSyncedDevice.slice(0, 64) || 'Field Workbench',
        revision: Math.max(1, config.revision),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        deviceName: config.deviceName.slice(0, 48) || 'AVL Echo',
        shortName: config.shortName.slice(0, 4) || 'AVLA',
        powerMode: config.powerMode,
        powerPolicy: config.powerPolicy,
        radioConfig: config.radioConfig,
        bleConfig: config.bleConfig,
        ringtoneConfig: config.ringtoneConfig,
        dashboardLayout: sanitizedLayout,
        channels: sanitizedChannels,
        lastSyncedDevice: config.lastSyncedDevice.slice(0, 64) || 'Field Workbench',
        revision: Math.max(1, config.revision),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCloudConfig(
  userId: string,
  configId: string,
  onData: (config: FirmwareConfig) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/configs/${configId}`;
  const ref = doc(db, 'users', userId, 'configs', configId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const updatedTs =
        d.updatedAt && typeof d.updatedAt.toDate === 'function'
          ? d.updatedAt.toDate().toISOString()
          : new Date().toISOString();
      onData({
        id: d.id,
        deviceName: d.deviceName,
        shortName: d.shortName,
        powerMode: d.powerMode,
        powerPolicy: d.powerPolicy,
        radioConfig: d.radioConfig,
        bleConfig: d.bleConfig,
        ringtoneConfig: d.ringtoneConfig,
        dashboardLayout: d.dashboardLayout,
        channels: d.channels,
        lastSyncedDevice: d.lastSyncedDevice,
        revision: d.revision,
        updatedAtIso: updatedTs,
      });
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function upsertCloudDevice(userId: string, device: SyncedDevice): Promise<void> {
  const deviceId = device.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `users/${userId}/devices/${deviceId}`;
  const ref = doc(db, 'users', userId, 'devices', deviceId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: deviceId,
        ownerId: userId,
        label: device.label.slice(0, 64),
        platform: device.platform,
        activeConfigId: device.activeConfigId,
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        label: device.label.slice(0, 64),
        platform: device.platform,
        activeConfigId: device.activeConfigId,
        lastSeenAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeCloudDevice(userId: string, deviceId: string): Promise<void> {
  const path = `users/${userId}/devices/${deviceId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'devices', deviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeCloudDevices(
  userId: string,
  onData: (devices: SyncedDevice[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/devices`;
  const q = query(collection(db, 'users', userId, 'devices'), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const items: SyncedDevice[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const lastSeen =
          d.lastSeenAt && typeof d.lastSeenAt.toDate === 'function'
            ? d.lastSeenAt.toDate().toISOString()
            : new Date().toISOString();
        return {
          id: d.id,
          label: d.label,
          platform: d.platform,
          activeConfigId: d.activeConfigId,
          lastSeenIso: lastSeen,
        };
      });
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createCloudMessage(userId: string, msg: MeshMessage): Promise<void> {
  const msgId = msg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `users/${userId}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'users', userId, 'messages', msgId), {
      id: msgId,
      ownerId: userId,
      channelIndex: msg.channelIndex,
      senderShort: msg.senderShort.slice(0, 4),
      plaintext: msg.plaintext.slice(0, 237),
      ciphertextHex: msg.ciphertextHex.slice(0, 600),
      hopLimit: msg.hopLimit,
      snrDb: msg.snrDb,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeCloudMessages(
  userId: string,
  onData: (msgs: MeshMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/messages`;
  const q = query(
    collection(db, 'users', userId, 'messages'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs: MeshMessage[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdIso =
          d.createdAt && typeof d.createdAt.toDate === 'function'
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString();
        return {
          id: d.id,
          channelIndex: d.channelIndex,
          senderShort: d.senderShort,
          plaintext: d.plaintext,
          ciphertextHex: d.ciphertextHex,
          hopLimit: d.hopLimit,
          snrDb: d.snrDb,
          createdAtIso: createdIso,
        };
      });
      onData(msgs);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}
