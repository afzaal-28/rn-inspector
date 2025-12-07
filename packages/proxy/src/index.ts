import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';

const DEFAULT_PORT = 8081;
const DEFAULT_HOST = '127.0.0.1';

export type ProxyOptions = {
  metroPort?: number;
  host?: string;
  uiPort?: number;
};

function getMetroPort(envPort?: string | undefined): number {
  if (envPort) {
    const parsed = Number(envPort);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
    console.warn(`[rn-inspector-proxy] Ignoring invalid METRO_PORT="${envPort}", falling back to ${DEFAULT_PORT}`);
  }
  return DEFAULT_PORT;
}

export async function startProxy(opts: ProxyOptions = {}) {
  const metroPort = opts.metroPort ?? getMetroPort(process.env.METRO_PORT);
  const host = opts.host ?? DEFAULT_HOST;
  const uiPort = opts.uiPort ?? 9230;

  const targetWsUrl = `ws://${host}:${metroPort}/message`;
  console.log(`[rn-inspector-proxy] Connecting to ${targetWsUrl} ...`);

  const metroWs = new WebSocket(targetWsUrl);

  metroWs.on('open', () => {
    console.log('[rn-inspector-proxy] Connected to Metro websocket');
  });

  const uiWss = new WebSocketServer({ port: uiPort });
  uiWss.on('listening', () => {
    console.log(`[rn-inspector-proxy] UI WebSocket server on ws://${host}:${uiPort}/inspector`);
  });

  const broadcast = (message: unknown) => {
    const data = JSON.stringify(message);
    uiWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  metroWs.on('message', (data: RawData) => {
    const raw = data.toString();
    const evt = { type: 'console', payload: { ts: new Date().toISOString(), level: 'info', msg: raw, origin: 'metro' } };
    broadcast(evt);
    console.log('[rn-inspector-proxy] console evt broadcast');
  });

  metroWs.on('close', () => {
    console.warn('[rn-inspector-proxy] Metro websocket closed');
  });

  metroWs.on('error', (err: Error) => {
    console.error('[rn-inspector-proxy] Metro websocket error:', err);
  });

  const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uiWs: `ws://${host}:${uiPort}/inspector` }));
  });

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log('[rn-inspector-proxy] Local server listening on', address);

  return { metroWs, uiWss, server };
}

if (require.main === module) {
  startProxy().catch((err) => {
    console.error('[rn-inspector-proxy] failed to start:', err);
    process.exit(1);
  });
}
