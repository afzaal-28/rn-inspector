import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addConsoleEvent,
  addNetworkEvent,
  addStorageEvent,
  pruneOldConsoleEvents,
  pruneOldNetworkEvents,
  pruneOldStorageEvents,
} from '../utils/db';

export type ConsoleEvent = {
  ts: string;
  level: 'log' | 'info' | 'warn' | 'error';
  msg: string;
  origin?: string;
  deviceId?: string;
  rawArgs?: unknown[];
  rawCdpArgs?: unknown[];
};

export type NetworkHeaders = Record<string, string>;

export type NetworkResourceType =
  | 'fetch'
  | 'xhr'
  | 'doc'
  | 'css'
  | 'js'
  | 'font'
  | 'img'
  | 'media'
  | 'socket'
  | 'other';

export type NetworkEvent = {
  id?: string;
  phase?: 'start' | 'response' | 'end' | 'error';
  ts: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  error?: string;
  requestHeaders?: NetworkHeaders;
  responseHeaders?: NetworkHeaders;
  requestBody?: unknown;
  responseBody?: unknown;
  deviceId?: string;
  source?: 'fetch' | 'xhr' | 'native' | 'image-prefetch' | 'image-getsize' | 'websocket' | string;
  resourceType?: NetworkResourceType;
};

export type DeviceInfo = {
  id: string;
  label: string;
  url?: string;
};

export type StorageEvent = {
  requestId: string;
  asyncStorage: Record<string, unknown> | null;
  redux: Record<string, unknown> | null;
  error?: string;
  deviceId?: string;
  ts: string;
};

export type NavigationRoute = {
  name: string;
  key: string;
  params?: Record<string, unknown>;
  path?: string;
};

export type NavigationState = {
  state?: unknown;
  currentRoute?: NavigationRoute;
};

export type NavigationHistoryEntry = {
  name: string;
  key: string;
  params?: Record<string, unknown>;
  timestamp: string;
};

export type NavigationEvent = {
  type: 'installed' | 'ref-ready' | 'state-change' | 'navigate' | 'go-back' | 'reset' | 'open-url';
  state?: NavigationState;
  history?: NavigationHistoryEntry[];
  availableRoutes?: NavigationRoute[];
  routeName?: string;
  routeKey?: string;
  params?: Record<string, unknown>;
  url?: string;
  timestamp?: string;
  deviceId?: string;
};

export type ProxyEvent =
  | { type: 'console'; payload: ConsoleEvent }
  | { type: 'network'; payload: NetworkEvent }
  | { type: 'storage'; payload: StorageEvent }
  | { type: 'navigation'; payload: NavigationEvent }
  | { type: 'meta'; payload: Record<string, unknown> };

export type StorageMutationPayload = {
  target: 'asyncStorage' | 'redux';
  op: 'set' | 'delete';
  path: string | string[];
  value?: unknown;
  deviceId?: string;
};

export function useProxyStream(endpoint?: string) {
  const basePort = 9230;
  const messagesUrl = endpoint || `ws://localhost:${basePort}/inspector-messages`;
  const networkUrl = endpoint
    ? endpoint.replace('/inspector-messages', '/inspector-network')
    : `ws://localhost:${basePort + 1}/inspector-network`;
  const storageUrl = endpoint
    ? endpoint.replace('/inspector-messages', '/inspector-storage')
    : `ws://localhost:${basePort + 2}/inspector-storage`;
  const controlUrl = endpoint
    ? endpoint.replace('/inspector-messages', '/inspector-control')
    : `ws://localhost:${basePort + 3}/inspector-control`;
  const navigationUrl = endpoint
    ? endpoint.replace('/inspector-messages', '/inspector-navigation')
    : `ws://localhost:${basePort + 4}/inspector-navigation`;

  const messagesWsRef = useRef<WebSocket | null>(null);
  const networkWsRef = useRef<WebSocket | null>(null);
  const storageWsRef = useRef<WebSocket | null>(null);
  const controlWsRef = useRef<WebSocket | null>(null);
  const navigationWsRef = useRef<WebSocket | null>(null);
  const [consoleEvents, setConsoleEvents] = useState<ConsoleEvent[]>([]);
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([]);
  const [storageData, setStorageData] = useState<Map<string, StorageEvent>>(new Map());
  const [consoleCount, setConsoleCount] = useState(0);
  const [networkCount, setNetworkCount] = useState(0);
  const pruneTimerRef = useRef<number | null>(null);
  const [navigationState, setNavigationState] = useState<NavigationState | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryEntry[]>([]);
  const [availableRoutes, setAvailableRoutes] = useState<NavigationRoute[]>([]);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('rn_inspector_active_device');
        if (saved && saved !== 'all') return saved as string;
      } catch {
        // ignore storage errors
      }
    }
    return '';
  });

  const [devtoolsStatus, setDevtoolsStatus] = useState<'unknown' | 'open' | 'closed' | 'error'>(
    'unknown',
  );

  const handleProxyEvent = async (parsed: ProxyEvent) => {
    if (parsed.type === 'console') {
      await addConsoleEvent(parsed.payload);
      setConsoleEvents((prev) => [...prev, parsed.payload].slice(-100));
      setConsoleCount((prev) => prev + 1);
    } else if (parsed.type === 'network') {
      await addNetworkEvent(parsed.payload);
      setNetworkEvents((prev) => [...prev, parsed.payload].slice(-100));
      setNetworkCount((prev) => prev + 1);
    } else if (parsed.type === 'navigation') {
      const navPayload = parsed.payload as NavigationEvent;
      if (navPayload.state) {
        setNavigationState(navPayload.state);
      }
      if (navPayload.history) {
        setNavigationHistory(navPayload.history);
      }
      if (navPayload.availableRoutes) {
        setAvailableRoutes(navPayload.availableRoutes);
      }
    } else if (parsed.type === 'storage') {
      const storagePayload = parsed.payload as StorageEvent;
      const deviceId = storagePayload.deviceId || 'unknown';
      await addStorageEvent(storagePayload);
      setStorageData((prev) => {
        const next = new Map(prev);
        next.set(deviceId, storagePayload);
        return next;
      });
      if (
        typeof storagePayload.requestId === 'string' &&
        storagePayload.requestId.startsWith('storage-mutate')
      ) {
        const asyncError =
          storagePayload.asyncStorage &&
          typeof storagePayload.asyncStorage === 'object' &&
          'error' in storagePayload.asyncStorage
            ? (storagePayload.asyncStorage as any).error
            : null;
        const reduxError =
          storagePayload.redux &&
          typeof storagePayload.redux === 'object' &&
          'error' in storagePayload.redux
            ? (storagePayload.redux as any).error
            : null;
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
          if (asyncError || reduxError) {
            const message = asyncError || reduxError || 'Storage mutation failed.';
            window.showNotification(message, 'error');
          } else {
            window.showNotification('Storage updated successfully.', 'success');
          }
        }
      }
    } else if (parsed.type === 'meta') {
      const payload = parsed.payload as any;
      const kind = payload?.kind;

      if (kind === 'devices' && Array.isArray(payload.devices)) {
        const mapped: DeviceInfo[] = payload.devices
          .map((d: any) => {
            if (!d) return null;
            const id = typeof d.id !== 'undefined' ? String(d.id) : '';
            if (!id) return null;
            const label = typeof d.label === 'string' && d.label.length > 0 ? d.label : id;
            const url = typeof d.url === 'string' ? d.url : undefined;
            return { id, label, url } as DeviceInfo;
          })
          .filter((d: DeviceInfo | null): d is DeviceInfo => d != null);

        setDevices(mapped);
        if (mapped.length > 0) {
          setActiveDeviceId((prev) => {
            if (prev && mapped.some((d) => d.id === prev)) {
              return prev;
            }
            return mapped[0]?.id ?? '';
          });
        } else {
          setActiveDeviceId('');
        }
      } else {
        const source = payload?.source;
        const statusValue = payload?.status;
        if (source === 'devtools' && typeof statusValue === 'string') {
          if (statusValue === 'open' || statusValue === 'closed' || statusValue === 'error') {
            setDevtoolsStatus(statusValue);
          }
        }
        const message =
          typeof payload?.message === 'string' ? payload.message : 'Proxy status changed.';
        const level = (payload?.level as any) ?? 'info';
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
          window.showNotification(message, level);
        }
      }
    }
  };

  useEffect(() => {
    let stopped = false;
    let openCount = 0;

    const checkAllOpen = () => {
      openCount++;
      if (openCount === 5) {
        setStatus('open');
      }
    };

    const handleConnectionClose = () => {
      if (stopped) return;
      setStatus('closed');
      setDevtoolsStatus('closed');
      setDevices([]);
      if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
        window.showNotification(
          'Proxy websocket closed. Click the WS chip to try reconnecting.',
          'warning' as any,
        );
      }
    };

    const connectMessages = () => {
      if (stopped) return;
      const ws = new WebSocket(messagesUrl);
      messagesWsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[ui] Messages websocket connected');
        checkAllOpen();
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse messages', err);
        }
      });

      ws.addEventListener('close', handleConnectionClose);
      ws.addEventListener('error', () => {
        if (stopped) return;
        setStatus('error');
        ws.close();
      });
    };

    const connectNetwork = () => {
      if (stopped) return;
      const ws = new WebSocket(networkUrl);
      networkWsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[ui] Network websocket connected');
        checkAllOpen();
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse network', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        console.warn('[ui] Network websocket closed');
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        console.error('[ui] Network websocket error');
        ws.close();
      });
    };

    const connectStorage = () => {
      if (stopped) return;
      const ws = new WebSocket(storageUrl);
      storageWsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[ui] Storage websocket connected');
        checkAllOpen();
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse storage', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        console.warn('[ui] Storage websocket closed');
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        console.error('[ui] Storage websocket error');
        ws.close();
      });
    };

    const connectControl = () => {
      if (stopped) return;
      const ws = new WebSocket(controlUrl);
      controlWsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[ui] Control websocket connected');
        checkAllOpen();
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse control', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        console.warn('[ui] Control websocket closed');
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        console.error('[ui] Control websocket error');
        ws.close();
      });
    };

    const connectNavigation = () => {
      if (stopped) return;
      const ws = new WebSocket(navigationUrl);
      navigationWsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[ui] Navigation websocket connected');
        checkAllOpen();
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse navigation', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        console.warn('[ui] Navigation websocket closed');
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        console.error('[ui] Navigation websocket error');
        ws.close();
      });
    };

    setStatus('connecting');
    connectMessages();
    connectNetwork();
    connectStorage();
    connectControl();
    connectNavigation();

    return () => {
      stopped = true;
      messagesWsRef.current?.close();
      networkWsRef.current?.close();
      storageWsRef.current?.close();
      controlWsRef.current?.close();
      navigationWsRef.current?.close();
    };
  }, [messagesUrl, networkUrl, storageUrl, controlUrl, navigationUrl]);

  useEffect(() => {
    if (typeof window !== 'undefined' && activeDeviceId) {
      try {
        window.localStorage.setItem('rn_inspector_active_device', activeDeviceId);
      } catch {
        // ignore storage errors
      }
    }
  }, [activeDeviceId]);

  const stats = useMemo(
    () => ({
      consoleCount,
      networkCount,
      status,
    }),
    [consoleCount, networkCount, status],
  );

  useEffect(() => {
    if (pruneTimerRef.current) {
      clearInterval(pruneTimerRef.current);
    }

    pruneTimerRef.current = setInterval(async () => {
      await pruneOldConsoleEvents(10000);
      await pruneOldNetworkEvents(10000);
      await pruneOldStorageEvents(1000);
    }, 60000);

    return () => {
      if (pruneTimerRef.current) {
        clearInterval(pruneTimerRef.current);
      }
    };
  }, []);

  const reconnect = () => {
    setStatus('connecting');
    messagesWsRef.current?.close();
    networkWsRef.current?.close();
    storageWsRef.current?.close();
    controlWsRef.current?.close();
    navigationWsRef.current?.close();

    let openCount = 0;
    const checkAllOpen = () => {
      openCount++;
      if (openCount === 5) {
        setStatus('open');
      }
    };

    const handleClose = () => {
      setStatus('closed');
      setDevtoolsStatus('closed');
      setDevices([]);
    };

    const messagesWs = new WebSocket(messagesUrl);
    messagesWsRef.current = messagesWs;
    messagesWs.addEventListener('open', () => {
      console.log('[ui] Messages websocket reconnected');
      checkAllOpen();
    });
    messagesWs.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse messages', err);
      }
    });
    messagesWs.addEventListener('close', handleClose);
    messagesWs.addEventListener('error', () => {
      setStatus('error');
      messagesWs.close();
    });

    const networkWs = new WebSocket(networkUrl);
    networkWsRef.current = networkWs;
    networkWs.addEventListener('open', () => {
      console.log('[ui] Network websocket reconnected');
      checkAllOpen();
    });
    networkWs.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse network', err);
      }
    });
    networkWs.addEventListener('close', () => {
      console.warn('[ui] Network websocket closed');
    });
    networkWs.addEventListener('error', () => {
      console.error('[ui] Network websocket error');
      networkWs.close();
    });

    const storageWs = new WebSocket(storageUrl);
    storageWsRef.current = storageWs;
    storageWs.addEventListener('open', () => {
      console.log('[ui] Storage websocket reconnected');
      checkAllOpen();
    });
    storageWs.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse storage', err);
      }
    });
    storageWs.addEventListener('close', () => {
      console.warn('[ui] Storage websocket closed');
    });
    storageWs.addEventListener('error', () => {
      console.error('[ui] Storage websocket error');
      storageWs.close();
    });

    const controlWs = new WebSocket(controlUrl);
    controlWsRef.current = controlWs;
    controlWs.addEventListener('open', () => {
      console.log('[ui] Control websocket reconnected');
      checkAllOpen();
    });
    controlWs.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse control', err);
      }
    });
    controlWs.addEventListener('close', () => {
      console.warn('[ui] Control websocket closed');
    });
    controlWs.addEventListener('error', () => {
      console.error('[ui] Control websocket error');
      controlWs.close();
    });

    const navigationWs = new WebSocket(navigationUrl);
    navigationWsRef.current = navigationWs;
    navigationWs.addEventListener('open', () => {
      console.log('[ui] Navigation websocket reconnected');
      checkAllOpen();
    });
    navigationWs.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse navigation', err);
      }
    });
    navigationWs.addEventListener('close', () => {
      console.warn('[ui] Navigation websocket closed');
    });
    navigationWs.addEventListener('error', () => {
      console.error('[ui] Navigation websocket error');
      navigationWs.close();
    });
  };

  const reconnectDevtools = () => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'reconnect-devtools',
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const mutateStorage = (payload: StorageMutationPayload) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'mutate-storage',
          deviceId: payload.deviceId || activeDeviceId,
          requestId: `storage-mutate-${Date.now()}`,
          target: payload.target,
          op: payload.op,
          path: payload.path,
          value: payload.value,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const fetchStorage = (deviceId?: string) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'fetch-storage',
          deviceId: deviceId || activeDeviceId,
          requestId: `storage-${Date.now()}`,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const navigateToRoute = (
    routeKey: string,
    params?: Record<string, unknown>,
    deviceId?: string,
  ) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'navigate',
          routeKey,
          params,
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const replaceToRoute = (
    routeKey: string,
    params?: Record<string, unknown>,
    deviceId?: string,
  ) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'replace',
          routeKey,
          params,
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const goBack = (deviceId?: string) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'go-back',
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const resetNavigation = (state: unknown, deviceId?: string) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'reset-navigation',
          state,
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const openUrl = (url: string, deviceId?: string) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'open-url',
          url,
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const getNavigationState = (deviceId?: string) => {
    if (!controlWsRef.current || controlWsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      controlWsRef.current.send(
        JSON.stringify({
          type: 'control',
          command: 'get-navigation-state',
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  return {
    consoleEvents,
    networkEvents,
    storageData,
    navigationState,
    navigationHistory,
    availableRoutes,
    status,
    stats,
    reconnect,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    devtoolsStatus,
    reconnectDevtools,
    fetchStorage,
    mutateStorage,
    navigateToRoute,
    replaceToRoute,
    goBack,
    resetNavigation,
    openUrl,
    getNavigationState,
  };
}

export function useProxy() {
  return useProxyStream();
}
