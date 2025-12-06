#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import path from 'path';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';

const DEFAULT_METRO_PORT = 8081;
const DEFAULT_UI_WS_PORT = 9230;
const DEFAULT_UI_STATIC_PORT = 4173;
const baseFile: string = typeof __filename !== 'undefined' ? __filename : path.resolve(process.argv[1] ?? '');
const baseDir: string = typeof __dirname !== 'undefined' ? __dirname : path.dirname(baseFile);

type ProxyOptions = {
  metroPort?: number;
  host?: string;
  uiWsPort?: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { metroPort: number; uiWsPort: number; uiPort: number } = {
    metroPort: DEFAULT_METRO_PORT,
    uiWsPort: DEFAULT_UI_WS_PORT,
    uiPort: DEFAULT_UI_STATIC_PORT,
  };
  args.forEach((arg) => {
    if (arg.startsWith('--port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.metroPort = val;
    } else if (arg.startsWith('--ui-port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.uiPort = val;
    } else if (arg.startsWith('--ui-ws-port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.uiWsPort = val;
    }
  });
  if (process.env.METRO_PORT) {
    const v = Number(process.env.METRO_PORT);
    if (!Number.isNaN(v)) parsed.metroPort = v;
  }
  return parsed;
}

function getMetroPort(envPort?: string | undefined): number {
  if (envPort) {
    const parsed = Number(envPort);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
    console.warn(`[rn-inspector] Ignoring invalid METRO_PORT="${envPort}", falling back to ${DEFAULT_METRO_PORT}`);
  }
  return DEFAULT_METRO_PORT;
}

async function startProxy(opts: ProxyOptions = {}) {
  const metroPort = opts.metroPort ?? getMetroPort(process.env.METRO_PORT);
  const host = opts.host ?? '127.0.0.1';
  const uiPort = opts.uiWsPort ?? DEFAULT_UI_WS_PORT;

  const targetWsUrl = `ws://${host}:${metroPort}/message`;
  console.log(`[rn-inspector] Connecting to ${targetWsUrl} ...`);

  const metroWs = new WebSocket(targetWsUrl);

  metroWs.on('open', () => {
    console.log('[rn-inspector] Connected to Metro websocket');
  });

  const uiWss = new WebSocketServer({ port: uiPort });
  uiWss.on('listening', () => {
    console.log(`[rn-inspector] UI WebSocket server on ws://${host}:${uiPort}/inspector`);
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
  });

  metroWs.on('close', () => {
    console.warn('[rn-inspector] Metro websocket closed');
  });

  metroWs.on('error', (err: Error) => {
    console.error('[rn-inspector] Metro websocket error:', err);
  });

  const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uiWs: `ws://${host}:${uiPort}/inspector` }));
  });

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log('[rn-inspector] Local proxy health endpoint on', address);

  return { metroWs, uiWss, server };
}

function startStaticUi(staticPort: number) {
  const staticDir = path.resolve(baseDir, '../ui-dist');
  const serve = serveStatic(staticDir);
  const server = http.createServer((req, res) => {
    serve(req as any, res as any, finalhandler(req as any, res as any));
  });
  server.listen(staticPort, () => {
    console.log(`[rn-inspector] UI served at http://localhost:${staticPort}`);
  });
  return server;
}

export async function main() {
  const { metroPort, uiPort, uiWsPort } = parseArgs();

  console.log(`[rn-inspector] starting proxy (Metro ${metroPort}, UI WS ${uiWsPort ?? DEFAULT_UI_WS_PORT})`);
  await startProxy({ metroPort, uiWsPort });

  console.log('[rn-inspector] serving UI assets...');
  startStaticUi(uiPort);

  console.log(`[rn-inspector] open http://localhost:${uiPort} (UI connects to ws://localhost:${uiWsPort ?? DEFAULT_UI_WS_PORT}/inspector)`);
}

const entrypoint = baseFile;
const invoked = process.argv[1] && path.resolve(process.argv[1]) === entrypoint;

if (invoked) {
  main().catch((err) => {
    console.error('[rn-inspector] CLI failed:', err);
    process.exit(1);
  });
}
