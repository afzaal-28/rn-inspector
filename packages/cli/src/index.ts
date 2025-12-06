import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_METRO_PORT = 8081;
const DEFAULT_UI_PORT = 9230;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ProxyOptions = {
  metroPort?: number;
  host?: string;
  uiPort?: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { metroPort: number; uiPort: number; uiDev?: boolean } = {
    metroPort: DEFAULT_METRO_PORT,
    uiPort: DEFAULT_UI_PORT,
  };
  args.forEach((arg) => {
    if (arg.startsWith('--port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.metroPort = val;
    } else if (arg.startsWith('--ui-port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.uiPort = val;
    } else if (arg === '--ui-dev') {
      parsed.uiDev = true;
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
  const uiPort = opts.uiPort ?? DEFAULT_UI_PORT;

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

async function startUi(uiDev: boolean) {
  const uiDir = path.resolve(__dirname, '../../ui');
  if (uiDev) {
    console.log('[rn-inspector] starting Tauri (dev) in packages/ui ...');
    const sub = execa('npm', ['run', 'tauri', '--', 'dev'], { cwd: uiDir, stdio: 'inherit' });
    sub.catch((err: unknown) => console.error('[rn-inspector] ui dev failed', err));
    return sub;
  }
  console.log('[rn-inspector] building Tauri app (this may take a while)...');
  await execa('npm', ['run', 'tauri', '--', 'build'], { cwd: uiDir, stdio: 'inherit' });
  console.log('[rn-inspector] built UI. Launching...');
  const exePath = path.resolve(uiDir, 'src-tauri', 'target', 'release');
  const binary = process.platform === 'win32' ? path.join(exePath, 'rn-inspector-ui.exe') : path.join(exePath, 'rn-inspector-ui');
  const sub = execa(binary, { stdio: 'inherit' });
  sub.catch((err: unknown) => console.error('[rn-inspector] ui run failed', err));
  return sub;
}

export async function main() {
  const { metroPort, uiPort, uiDev } = parseArgs();

  console.log(`[rn-inspector] starting proxy (Metro ${metroPort}, UI WS ${uiPort})`);
  await startProxy({ metroPort, uiPort });

  console.log('[rn-inspector] launching UI...');
  await startUi(Boolean(uiDev));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[rn-inspector] CLI failed:', err);
    process.exit(1);
  });
}
