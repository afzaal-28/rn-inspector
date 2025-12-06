import { useEffect, useMemo, useRef, useState } from 'react';

export type ConsoleEvent = {
  ts: string;
  level: 'log' | 'info' | 'warn' | 'error';
  msg: string;
  origin?: string;
};

export type NetworkEvent = {
  ts: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  error?: string;
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
          if (parsed.type === 'console') {
            setConsoleEvents((prev) => [...prev, parsed.payload].slice(-500));
          } else if (parsed.type === 'network') {
            setNetworkEvents((prev) => [...prev, parsed.payload].slice(-500));
          }
        } catch (err) {
          console.warn('[ui] failed to parse proxy message', err);
        }
      });

      ws.addEventListener('close', () => {
        if (stopped) return;
        setStatus('closed');
      });
      ws.addEventListener('error', () => {
        if (stopped) return;
        setStatus('error');
        ws.close();
      });
    };

    connect();

    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, [url]);

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
    // reconnect will be triggered by effect because url stays same; we re-run connect manually
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener('open', () => setStatus('open'));
    ws.addEventListener('message', (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        if (parsed.type === 'console') {
          setConsoleEvents((prev) => [...prev, parsed.payload].slice(-500));
        } else if (parsed.type === 'network') {
          setNetworkEvents((prev) => [...prev, parsed.payload].slice(-500));
        }
      } catch (err) {
        console.warn('[ui] failed to parse proxy message', err);
      }
    });
    ws.addEventListener('close', () => setStatus('closed'));
    ws.addEventListener('error', () => {
      setStatus('error');
      ws.close();
    });
  };

  return { consoleEvents, networkEvents, status, stats, reconnect };
}
