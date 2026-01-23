import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ConsoleEvent, NetworkEvent, StorageEvent } from '../hooks/useProxyStream';

interface InspectorDB extends DBSchema {
  console: {
    key: number;
    value: ConsoleEvent & { id: number };
    indexes: {
      'by-timestamp': string;
      'by-device': string;
      'by-level': string;
    };
  };
  network: {
    key: number;
    value: NetworkEvent & { id: number };
    indexes: {
      'by-timestamp': string;
      'by-device': string;
      'by-method': string;
      'by-status': number;
    };
  };
  storage: {
    key: number;
    value: StorageEvent & { id: number };
    indexes: {
      'by-timestamp': string;
      'by-device': string;
      'by-requestId': string;
    };
  };
}

const DB_NAME = 'rn-inspector-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<InspectorDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<InspectorDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<InspectorDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('console')) {
        const consoleStore = db.createObjectStore('console', {
          keyPath: 'id',
          autoIncrement: true,
        });
        consoleStore.createIndex('by-timestamp', 'ts');
        consoleStore.createIndex('by-device', 'deviceId');
        consoleStore.createIndex('by-level', 'level');
      }

      if (!db.objectStoreNames.contains('network')) {
        const networkStore = db.createObjectStore('network', {
          keyPath: 'id',
          autoIncrement: true,
        });
        networkStore.createIndex('by-timestamp', 'ts');
        networkStore.createIndex('by-device', 'deviceId');
        networkStore.createIndex('by-method', 'method');
        networkStore.createIndex('by-status', 'status');
      }

      if (!db.objectStoreNames.contains('storage')) {
        const storageStore = db.createObjectStore('storage', {
          keyPath: 'id',
          autoIncrement: true,
        });
        storageStore.createIndex('by-timestamp', 'ts');
        storageStore.createIndex('by-device', 'deviceId');
        storageStore.createIndex('by-requestId', 'requestId');
      }
    },
  });

  return dbInstance;
}

export async function addConsoleEvent(event: ConsoleEvent): Promise<void> {
  const db = await getDB();
  await db.add('console', event as any);
}

export async function addNetworkEvent(event: NetworkEvent): Promise<void> {
  const db = await getDB();
  await db.add('network', event as any);
}

export async function addStorageEvent(event: StorageEvent): Promise<void> {
  const db = await getDB();
  await db.add('storage', event as any);
}

export interface ConsoleQueryOptions {
  deviceId?: string;
  level?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  afterTimestamp?: string;
}

export async function queryConsoleEvents(
  options: ConsoleQueryOptions = {},
): Promise<(ConsoleEvent & { id: number })[]> {
  const db = await getDB();
  const { deviceId, level, searchQuery, limit = 300, offset = 0, afterTimestamp } = options;

  let events = await db.getAllFromIndex('console', 'by-timestamp');

  events = events.reverse();

  if (afterTimestamp) {
    events = events.filter((evt) => {
      const tsMs = Date.parse(evt.ts);
      const afterMs = Date.parse(afterTimestamp);
      if (Number.isNaN(tsMs) || Number.isNaN(afterMs)) return true;
      return tsMs > afterMs;
    });
  }

  if (deviceId) {
    events = events.filter((evt) => !evt.deviceId || evt.deviceId === deviceId);
  }

  if (level && level !== 'all') {
    events = events.filter((evt) => evt.level === level);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    events = events.filter((evt) => evt.msg.toLowerCase().includes(query));
  }

  return events.slice(offset, offset + limit);
}

export async function getConsoleCount(deviceId?: string): Promise<number> {
  const db = await getDB();
  if (deviceId) {
    return (await db.getAllFromIndex('console', 'by-device', deviceId)).length;
  }
  return await db.count('console');
}

export interface NetworkQueryOptions {
  deviceId?: string;
  method?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export async function queryNetworkEvents(
  options: NetworkQueryOptions = {},
): Promise<(NetworkEvent & { id: number })[]> {
  const db = await getDB();
  const { deviceId, method, searchQuery, limit = 300, offset = 0 } = options;

  let events = await db.getAllFromIndex('network', 'by-timestamp');

  events = events.reverse();

  if (deviceId) {
    events = events.filter((evt) => !evt.deviceId || evt.deviceId === deviceId);
  }

  if (method) {
    events = events.filter((evt) => evt.method === method);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    events = events.filter((evt) => evt.url.toLowerCase().includes(query));
  }

  return events.slice(offset, offset + limit);
}

export async function getNetworkCount(deviceId?: string): Promise<number> {
  const db = await getDB();
  if (deviceId) {
    return (await db.getAllFromIndex('network', 'by-device', deviceId)).length;
  }
  return await db.count('network');
}

export async function queryStorageEvents(
  deviceId?: string,
  limit = 50,
): Promise<(StorageEvent & { id: number })[]> {
  const db = await getDB();

  let events = await db.getAllFromIndex('storage', 'by-timestamp');

  events = events.reverse();

  if (deviceId) {
    events = events.filter((evt) => !evt.deviceId || evt.deviceId === deviceId);
  }

  return events.slice(0, limit);
}

export async function getLatestStorageEvent(
  deviceId: string,
): Promise<(StorageEvent & { id: number }) | undefined> {
  const db = await getDB();
  const events = await db.getAllFromIndex('storage', 'by-device', deviceId);

  if (events.length === 0) return undefined;

  return events[events.length - 1];
}

export async function clearConsoleEvents(): Promise<void> {
  const db = await getDB();
  await db.clear('console');
}

export async function clearNetworkEvents(): Promise<void> {
  const db = await getDB();
  await db.clear('network');
}

export async function clearStorageEvents(): Promise<void> {
  const db = await getDB();
  await db.clear('storage');
}

export async function clearAllData(): Promise<void> {
  await clearConsoleEvents();
  await clearNetworkEvents();
  await clearStorageEvents();
}

export async function pruneOldConsoleEvents(keepCount = 10000): Promise<void> {
  const db = await getDB();
  const count = await db.count('console');

  if (count <= keepCount) return;

  const toDelete = count - keepCount;
  const events = await db.getAllFromIndex('console', 'by-timestamp', null, toDelete);

  const tx = db.transaction('console', 'readwrite');
  for (const event of events) {
    await tx.store.delete(event.id);
  }
  await tx.done;
}

export async function pruneOldNetworkEvents(keepCount = 10000): Promise<void> {
  const db = await getDB();
  const count = await db.count('network');

  if (count <= keepCount) return;

  const toDelete = count - keepCount;
  const events = await db.getAllFromIndex('network', 'by-timestamp', null, toDelete);

  const tx = db.transaction('network', 'readwrite');
  for (const event of events) {
    await tx.store.delete(event.id);
  }
  await tx.done;
}

export async function pruneOldStorageEvents(keepCount = 1000): Promise<void> {
  const db = await getDB();
  const count = await db.count('storage');

  if (count <= keepCount) return;

  const toDelete = count - keepCount;
  const events = await db.getAllFromIndex('storage', 'by-timestamp', null, toDelete);

  const tx = db.transaction('storage', 'readwrite');
  for (const event of events) {
    await tx.store.delete(event.id);
  }
  await tx.done;
}
