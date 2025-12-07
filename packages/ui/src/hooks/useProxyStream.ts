import { useEffect, useMemo, useRef, useState } from 'react';

export type ConsoleEvent = {
  ts: string;
  level: 'log' | 'info' | 'warn' | 'error';
  msg: string;
  origin?: string;
  deviceId?: string;
};

export type NetworkHeaders = Record<string, string>;

export type NetworkEvent = {
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
};

export type DeviceInfo = {
  id: string;
  label: string;
  url?: string;
};

export type ProxyEvent =
  | { type: 'console'; payload: ConsoleEvent }
  | { type: 'network'; payload: NetworkEvent }
  | { type: 'meta'; payload: Record<string, unknown> };

export function useProxyStream(endpoint?: string) {
  const url = endpoint || 'ws://localhost:9230/inspector';
  const wsRef = useRef<WebSocket | null>(null);
  const [consoleEvents, setConsoleEvents] = useState<ConsoleEvent[]>([]);
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | 'all'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('rn_inspector_active_device');
        if (saved) return saved as string;
      } catch {
        // ignore storage errors
      }
    }
    return 'all';
  });

  const handleProxyEvent = (parsed: ProxyEvent) => {
    if (parsed.type === 'console') {
      setConsoleEvents((prev) => [...prev, parsed.payload].slice(-500));
    } else if (parsed.type === 'network') {
      setNetworkEvents((prev) => [...prev, parsed.payload].slice(-500));
    } else if (parsed.type === 'meta') {
      const payload = parsed.payload as any;
      const kind = payload?.kind;

      if (kind === 'devices' && Array.isArray(payload.devices)) {
        const mapped: DeviceInfo[] = payload.devices
          .map((d: any) => {
            if (!d) return null;
            const id = typeof d.id !== 'undefined' ? String(d.id) : '';
            if (!id) return null;
            const label =
              typeof d.label === 'string' && d.label.length > 0 ? d.label : id;
            const url = typeof d.url === 'string' ? d.url : undefined;
            return { id, label, url } as DeviceInfo;
          })
          .filter((d: DeviceInfo | null): d is DeviceInfo => d != null);

        setDevices(mapped);
        if (mapped.length > 0) {
          setActiveDeviceId((prev) => {
            if (prev !== 'all' && mapped.some((d) => d.id === prev)) {
              return prev;
            }
            return mapped[0]?.id ?? 'all';
          });
        }
      } else {
        const message =
          typeof payload?.message === 'string'
            ? payload.message
            : 'Proxy status changed.';
        const level = (payload?.level as any) ?? 'info';
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
          window.showNotification(message, level);
        }
      }
    }
  };

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      setStatus('connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setStatus('open');
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn('[ui] failed to parse proxy message', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        setStatus('closed');
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
          window.showNotification(
            'Proxy websocket closed. Click the WS chip to try reconnecting.',
            'warning' as any,
          );
        }
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        setStatus('error');
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
          window.showNotification('Proxy websocket error. Check the CLI status.', 'error' as any);
        }
        ws.close();
      });
    };

    connect();

    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, [url]);

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
      consoleCount: consoleEvents.length,
      networkCount: networkEvents.length,
      status,
    }),
    [consoleEvents.length, networkEvents.length, status],
  );

  const reconnect = () => {
    setStatus('connecting');
    wsRef.current?.close();
    // Manual reconnect: create a fresh websocket and attach the same handlers.
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener('open', () => setStatus('open'));
    ws.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn('[ui] failed to parse proxy message', err);
      }
    });
    ws.addEventListener('close', () => {
      setStatus('closed');
    });
    ws.addEventListener('error', () => {
      setStatus('error');
      if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
        window.showNotification('Proxy websocket error. Check the CLI status.', 'error' as any);
      }
      ws.close();
    });
  };

  return { consoleEvents, networkEvents, status, stats, reconnect, devices, activeDeviceId, setActiveDeviceId };
}
