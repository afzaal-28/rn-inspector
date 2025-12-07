#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import path from 'path';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import { spawn } from 'child_process';

const DEFAULT_METRO_PORT = 8081;
const DEFAULT_UI_WS_PORT = 9230;
const DEFAULT_UI_STATIC_PORT = 4173;
const baseFile: string = typeof __filename !== 'undefined' ? __filename : path.resolve(process.argv[1] ?? '');
const baseDir: string = typeof __dirname !== 'undefined' ? __dirname : path.dirname(baseFile);

type ProxyOptions = {
  metroPort?: number;
  host?: string;
  uiWsPort?: number;
  devtoolsWsUrl?: string;
};

type DevtoolsTarget = {
  id: string;
  title?: string;
  description?: string;
  webSocketDebuggerUrl: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { metroPort: number; uiWsPort: number; uiPort: number; devtoolsWsUrl?: string } = {
    metroPort: DEFAULT_METRO_PORT,
    uiWsPort: DEFAULT_UI_WS_PORT,
    uiPort: DEFAULT_UI_STATIC_PORT,
    devtoolsWsUrl: process.env.RN_INSPECTOR_DEVTOOLS_URL,
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
    } else if (arg.startsWith('--devtools-url=')) {
      const val = arg.split('=')[1];
      if (val) parsed.devtoolsWsUrl = val;
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

function httpGetJson(host: string, port: number, path: string): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path,
        timeout: 750,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(undefined);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(text);
            resolve(json);
          } catch {
            resolve(undefined);
          }
        });
      },
    );

    req.on('error', () => {
      resolve(undefined);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
  });
}

async function discoverDevtoolsWsUrl(metroPort: number): Promise<string | undefined> {
  const host = '127.0.0.1';
  const candidates = new Set<number>();
  candidates.add(metroPort);
  for (let delta = 1; delta <= 10; delta += 1) {
    candidates.add(metroPort + delta);
  }
  [9222, 9229, 9230].forEach((p) => candidates.add(p));

  for (const port of candidates) {
    const json = await httpGetJson(host, port, '/json');
    if (!json) continue;

    const tryList = Array.isArray(json)
      ? json
      : Array.isArray((json as any).targets)
      ? (json as any).targets
      : [];

    for (const item of tryList) {
      if (item && typeof item.webSocketDebuggerUrl === 'string') {
        const url = item.webSocketDebuggerUrl as string;
        console.log(
          `[rn-inspector] Discovered DevTools target via http://${host}:${port}/json -> ${url}`,
        );
        return url;
      }
    }
  }

  console.log('[rn-inspector] DevTools auto-discovery found no /json targets (falling back to Metro-only mode)');
  return undefined;
}

async function discoverDevtoolsTargets(metroPort: number): Promise<DevtoolsTarget[]> {
  const host = '127.0.0.1';
  const candidates = new Set<number>();
  candidates.add(metroPort);
  for (let delta = 1; delta <= 10; delta += 1) {
    candidates.add(metroPort + delta);
  }
  [9222, 9229, 9230].forEach((p) => candidates.add(p));

  const results: DevtoolsTarget[] = [];

  for (const port of candidates) {
    const json = await httpGetJson(host, port, '/json');
    if (!json) continue;

    const tryList = Array.isArray(json)
      ? json
      : Array.isArray((json as any).targets)
      ? (json as any).targets
      : [];

    let index = 0;
    for (const item of tryList) {
      if (item && typeof (item as any).webSocketDebuggerUrl === 'string') {
        const url = String((item as any).webSocketDebuggerUrl);
        const id = String((item as any).id ?? `${port}-${index}`);
        const title = typeof (item as any).title === 'string' ? (item as any).title : undefined;
        const description =
          typeof (item as any).description === 'string' ? (item as any).description : undefined;
        results.push({ id, title, description, webSocketDebuggerUrl: url });
        index += 1;
      }
    }
  }

  if (results.length === 0) {
    console.log(
      '[rn-inspector] DevTools auto-discovery found no /json targets (falling back to Metro-only mode)',
    );
  } else {
    console.log('[rn-inspector] Discovered DevTools targets:');
    results.forEach((t, idx) => {
      const label = t.title || t.description || t.id;
      console.log(`  [${idx}] ${t.webSocketDebuggerUrl} (${label})`);
    });
  }

  return results;
}
type TrackedRequest = {
  method: string;
  url: string;
  startTimeMs: number;
  status?: number;
  durationMs?: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
};

type DevtoolsState = {
  requests: Map<string, TrackedRequest>;
};

const INJECT_NETWORK_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_NETWORK_PATCHED__) return;
    g.__RN_INSPECTOR_NETWORK_PATCHED__ = true;

    var originalFetch = g.fetch;
    if (typeof originalFetch !== 'function') return;

    function toPlainHeaders(headers) {
      var out = {};
      if (!headers) return out;
      try {
        if (typeof headers.forEach === 'function') {
          headers.forEach(function (v, k) {
            out[k] = String(v);
          });
        } else if (Array.isArray(headers)) {
          headers.forEach(function (entry) {
            if (entry && entry.length >= 2) out[entry[0]] = String(entry[1]);
          });
        } else if (typeof headers === 'object') {
          Object.keys(headers).forEach(function (k) {
            out[k] = String(headers[k]);
          });
        }
      } catch (e) {}
      return out;
    }

    g.fetch = function (input, init) {
      var id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      var start = Date.now();
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var requestHeaders = toPlainHeaders((init && init.headers) || (input && input.headers));
      var requestBody = init && typeof init.body !== 'undefined' ? init.body : undefined;

      function log(phase, extra) {
        try {
          if (typeof console !== 'undefined' && console.log) {
            var payload = Object.assign(
              {
                id: id,
                phase: phase,
                ts: new Date().toISOString(),
                method: method,
                url: url,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders,
                requestBody: requestBody,
              },
              extra || {},
            );
            console.log('__RN_INSPECTOR_NETWORK__:' + JSON.stringify(payload));
          }
        } catch (e) {}
      }

      log('start', { durationMs: 0 });

      return originalFetch(input, init)
        .then(function (res) {
          var responseHeaders = {};
          try {
            responseHeaders = toPlainHeaders(res && res.headers);
          } catch (e) {}

          var clone;
          try {
            clone = res && res.clone ? res.clone() : null;
          } catch (e) {
            clone = null;
          }

          if (!clone || typeof clone.text !== 'function') {
            log('end', {
              status: res && res.status,
              responseHeaders: responseHeaders,
            });
            return res;
          }

          return clone
            .text()
            .then(function (text) {
              var body = text && text.length > 10000 ? text.slice(0, 10000) : text;
              log('end', {
                status: res && res.status,
                responseHeaders: responseHeaders,
                responseBody: body,
              });
              return res;
            })
            .catch(function () {
              log('end', {
                status: res && res.status,
                responseHeaders: responseHeaders,
              });
              return res;
            });
        })
        .catch(function (error) {
          log('error', {
            error: String(error && error.message ? error.message : error),
          });
          throw error;
        });
    };
  } catch (eOuter) {}
})();`;

function normalizeHeaders(input: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return out;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapConsoleLevel(type: string | undefined): 'log' | 'info' | 'warn' | 'error' {
  if (type === 'error') return 'error';
  if (type === 'warning' || type === 'warn') return 'warn';
  if (type === 'info') return 'info';
  return 'log';
}

function handleInjectedNetworkFromConsole(
  params: any,
  state: DevtoolsState,
  broadcast: (message: unknown) => void,
  deviceId?: string,
): boolean {
  if (!params || !Array.isArray(params.args) || params.args.length === 0) return false;
  const first = params.args[0];
  const raw = typeof first.value === 'string' ? first.value : undefined;
  if (!raw || !raw.startsWith('__RN_INSPECTOR_NETWORK__')) return false;

  const rest = raw.slice('__RN_INSPECTOR_NETWORK__'.length);
  const trimmed = rest.trim().startsWith(':') ? rest.trim().slice(1).trim() : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true; // marker but unparsable; consume to avoid polluting console
  }

  const id = String(payload.id ?? '');
  if (!id) return true;

  const phase = payload.phase;
  const map = state.requests;

  if (phase === 'start') {
    const req: TrackedRequest = {
      method: String(payload.method || 'GET'),
      url: String(payload.url || ''),
      startTimeMs: Date.now(),
      requestHeaders: payload.requestHeaders as Record<string, string> | undefined,
      requestBody: payload.requestBody,
    };
    map.set(id, req);
  } else if (phase === 'end' || phase === 'error') {
    const existing: TrackedRequest =
      map.get(id) ?? {
        method: String(payload.method || 'GET'),
        url: String(payload.url || ''),
        startTimeMs: Date.now(),
      };
    if (typeof payload.status === 'number') existing.status = payload.status;
    if (typeof payload.durationMs === 'number') {
      existing.durationMs = payload.durationMs;
    } else {
      existing.durationMs = Date.now() - existing.startTimeMs;
    }
    if (payload.requestHeaders) {
      existing.requestHeaders = payload.requestHeaders as Record<string, string>;
    }
    if (payload.responseHeaders) {
      existing.responseHeaders = payload.responseHeaders as Record<string, string>;
    }
    if (typeof payload.error === 'string') existing.error = payload.error;
    if (typeof payload.responseBody !== 'undefined') {
      existing.responseBody = payload.responseBody;
    }

    const event = {
      type: 'network',
      payload: {
        ts: typeof payload.ts === 'string' ? payload.ts : new Date(existing.startTimeMs).toISOString(),
        method: existing.method,
        url: existing.url,
        status: existing.status,
        durationMs: existing.durationMs,
        error: existing.error,
        requestHeaders: existing.requestHeaders,
        responseHeaders: existing.responseHeaders,
        requestBody: existing.requestBody,
        responseBody: existing.responseBody,
        deviceId,
      },
    };
    broadcast(event);
    map.delete(id);
  }

  // handled; do not treat as normal console log
  return true;
}

function stringifyConsoleArgs(args: any[] | undefined): string {
  if (!Array.isArray(args) || args.length === 0) return '';
  return args
    .map((arg) => {
      if (!arg) return 'undefined';
      if (typeof arg.value !== 'undefined') return String(arg.value);
      // Use CDP object preview when available so objects are more readable than just "Object".
      if (arg.preview && Array.isArray(arg.preview.properties)) {
        try {
          const parts = (arg.preview.properties as any[]).map((p) => {
            const name = String(p.name ?? '');
            const value = typeof p.value !== 'undefined' ? String(p.value) : String(p.type ?? '');
            return `${name}: ${value}`;
          });
          return `{ ${parts.join(', ')} }`;
        } catch {
          // ignore and fall back
        }
      }
      if (typeof arg.description === 'string') return arg.description;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function normalizeConsoleArg(arg: any): unknown {
  if (!arg) return null;

  if (typeof arg.value !== 'undefined') return arg.value;

  if (arg.preview && Array.isArray(arg.preview.properties)) {
    try {
      const out: Record<string, unknown> = {};
      (arg.preview.properties as any[]).forEach((p) => {
        const name = String(p.name ?? '');
        const value =
          typeof p.value !== 'undefined'
            ? p.value
            : typeof p.type !== 'undefined'
            ? p.type
            : null;
        out[name] = value;
      });
      return out;
    } catch {
      // ignore and fall back
    }
  }

  if (typeof arg.description === 'string') return arg.description;

  try {
    return JSON.parse(JSON.stringify(arg));
  } catch {
    return String(arg);
  }
}

function handleRuntimeConsole(params: any, broadcast: (message: unknown) => void, deviceId?: string) {
  if (!params) return;
  const tsMs = typeof params.timestamp === 'number' ? params.timestamp * 1000 : Date.now();
  const argsArray = Array.isArray(params.args) ? params.args : [];
  const evt = {
    type: 'console',
    payload: {
      ts: new Date(tsMs).toISOString(),
      level: mapConsoleLevel(typeof params.type === 'string' ? params.type : undefined),
      msg: stringifyConsoleArgs(argsArray),
      origin: 'devtools',
      deviceId,
      rawArgs: argsArray.map((a: any) => normalizeConsoleArg(a)),
    },
  };
  broadcast(evt);
}

function handleLogEntry(params: any, broadcast: (message: unknown) => void, deviceId?: string) {
  if (!params || !params.entry) return;
  const entry = params.entry;
  const tsMs = typeof entry.timestamp === 'number' ? entry.timestamp * 1000 : Date.now();
  const message = typeof entry.text === 'string' ? entry.text : JSON.stringify(entry);
  const evt = {
    type: 'console',
    payload: {
      ts: new Date(tsMs).toISOString(),
      level: mapConsoleLevel(typeof entry.level === 'string' ? entry.level : undefined),
      msg: message,
      origin: 'devtools',
      deviceId,
    },
  };
  broadcast(evt);
}

function handleNetworkEvent(
  method: string,
  params: any,
  state: DevtoolsState,
  broadcast: (message: unknown) => void,
  deviceId?: string,
) {
  if (!params || !params.requestId) return;
  const id = String(params.requestId);
  const map = state.requests;

  if (method === 'Network.requestWillBeSent') {
    const request = params.request ?? {};
    const nowMs =
      typeof params.wallTime === 'number'
        ? params.wallTime * 1000
        : typeof params.timestamp === 'number'
        ? params.timestamp * 1000
        : Date.now();
    const existing: TrackedRequest =
      map.get(id) ?? {
        method: String(request.method || 'GET'),
        url: String(request.url || ''),
        startTimeMs: nowMs,
      };
    existing.method = String(request.method || existing.method);
    existing.url = String(request.url || existing.url);
    existing.startTimeMs = nowMs;
    const reqHeaders = normalizeHeaders(request.headers as Record<string, unknown> | undefined);
    if (reqHeaders) existing.requestHeaders = reqHeaders;
    if (typeof request.postData === 'string') {
      existing.requestBody = tryParseJson(request.postData);
    }
    map.set(id, existing);
  } else if (method === 'Network.responseReceived') {
    const response = params.response ?? {};
    const existing: TrackedRequest =
      map.get(id) ?? {
        method: 'GET',
        url: String(response.url || ''),
        startTimeMs: Date.now(),
      };
    if (typeof response.status === 'number') existing.status = response.status;
    const respHeaders = normalizeHeaders(response.headers as Record<string, unknown> | undefined);
    if (respHeaders) existing.responseHeaders = respHeaders;
    map.set(id, existing);
  } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
    const existing = map.get(id);
    if (!existing) return;
    const endMs =
      typeof params.timestamp === 'number' ? params.timestamp * 1000 : Date.now();
    existing.durationMs = endMs - existing.startTimeMs;
    if (method === 'Network.loadingFailed' && typeof params.errorText === 'string') {
      existing.error = params.errorText;
    }
    const event = {
      type: 'network',
      payload: {
        ts: new Date(existing.startTimeMs).toISOString(),
        method: existing.method,
        url: existing.url,
        status: existing.status,
        durationMs: existing.durationMs,
        error: existing.error,
        requestHeaders: existing.requestHeaders,
        responseHeaders: existing.responseHeaders,
        requestBody: existing.requestBody,
        responseBody: existing.responseBody,
        deviceId,
      },
    };
    broadcast(event);
    map.delete(id);
  }
}

function attachDevtoolsBridge(
  devtoolsWsUrl: string,
  broadcast: (message: unknown) => void,
  deviceId: string,
) {
  const state: DevtoolsState = { requests: new Map() };
  let devtoolsWs: WebSocket | null = null;

  const connect = () => {
    const ws = new WebSocket(devtoolsWsUrl);
    devtoolsWs = ws;

    ws.on('open', () => {
      console.log(`[rn-inspector] Connected to DevTools websocket ${devtoolsWsUrl}`);
      try {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
        ws.send(JSON.stringify({ id: 3, method: 'Network.enable' }));
        // Some DevTools backends require Page/Fetch domains for full Network info; these are best-effort.
        ws.send(JSON.stringify({ id: 4, method: 'Page.enable' }));
        ws.send(
          JSON.stringify({
            id: 5,
            method: 'Fetch.enable',
            params: { patterns: [{ urlPattern: '*' }] },
          }),
        );
        ws.send(
          JSON.stringify({
            id: 6,
            method: 'Runtime.evaluate',
            params: {
              expression: INJECT_NETWORK_SNIPPET,
              includeCommandLineAPI: false,
              awaitPromise: false,
            },
          }),
        );
        broadcast({
          type: 'meta',
          payload: {
            source: 'devtools',
            status: 'open',
            level: 'info',
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('[rn-inspector] Failed to send DevTools enable commands:', err);
      }
    });

    ws.on('message', (data: RawData) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.warn('[rn-inspector] Failed to parse DevTools message', err);
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const method = typeof msg.method === 'string' ? msg.method : undefined;
      const params = msg.params as any;

      if (!method) return;

      if (method === 'Runtime.consoleAPICalled') {
        if (handleInjectedNetworkFromConsole(params, state, broadcast, deviceId)) {
          return;
        }
        handleRuntimeConsole(params, broadcast, deviceId);
      } else if (method === 'Log.entryAdded') {
        handleLogEntry(params, broadcast, deviceId);
      } else if (
        method === 'Network.requestWillBeSent' ||
        method === 'Network.responseReceived' ||
        method === 'Network.loadingFinished' ||
        method === 'Network.loadingFailed'
      ) {
        handleNetworkEvent(method, params, state, broadcast, deviceId);
      }
    });

    ws.on('close', () => {
      console.warn('[rn-inspector] DevTools websocket closed');
      try {
        broadcast({
          type: 'meta',
          payload: {
            source: 'devtools',
            status: 'closed',
            level: 'warning',
            message:
              'DevTools websocket closed. If your app was reloaded or stopped, some network/console data may be missing until it reconnects.',
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch {
        // ignore broadcast errors
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[rn-inspector] DevTools websocket error:', err);
      try {
        broadcast({
          type: 'meta',
          payload: {
            source: 'devtools',
            status: 'error',
            level: 'error',
            message: 'DevTools websocket error. Check Metro / DevTools status in your React Native app.',
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch {
        // ignore broadcast errors
      }
    });

    return ws;
  };

  return connect();
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

  let currentDevices: { id: string; label: string; url?: string }[] = [];

  const broadcast = (message: unknown) => {
    const data = JSON.stringify(message);
    uiWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  let devtoolsWs: WebSocket | null = null;

  const attachDevtools = async () => {
    try {
      if (opts.devtoolsWsUrl) {
        // Explicit DevTools URL provided: treat as a single device.
        const deviceId = 'devtools-explicit';
        console.log(`[rn-inspector] Connecting to DevTools websocket ${opts.devtoolsWsUrl} ...`);
        devtoolsWs = attachDevtoolsBridge(opts.devtoolsWsUrl, broadcast, deviceId);

        currentDevices = [
          {
            id: deviceId,
            label: 'DevTools (explicit URL)',
            url: opts.devtoolsWsUrl,
          },
        ];

        broadcast({
          type: 'meta',
          payload: {
            kind: 'devices',
            devices: currentDevices,
            ts: new Date().toISOString(),
          },
        });
      } else {
        // Auto-discover all available DevTools targets and attach to each.
        const targets = await discoverDevtoolsTargets(metroPort);
        if (targets.length > 0) {
          const devices = targets.map((t, index) => ({
            id: t.id || `devtools-${index}`,
            label: t.title || t.description || t.id || `Target ${index + 1}`,
            url: t.webSocketDebuggerUrl,
          }));

          currentDevices = devices;

          broadcast({
            type: 'meta',
            payload: {
              kind: 'devices',
              devices: currentDevices,
              ts: new Date().toISOString(),
            },
          });

          devices.forEach((d, index) => {
            const target = targets[index];
            const ws = attachDevtoolsBridge(target.webSocketDebuggerUrl, broadcast, d.id);
            if (!devtoolsWs) devtoolsWs = ws;
          });
        } else {
          broadcast({
            type: 'meta',
            payload: {
              source: 'devtools',
              status: 'closed',
              level: 'warning',
              message:
                'DevTools auto-discovery found no /json targets (falling back to Metro-only mode). Make sure your React Native app is running with debugging enabled.',
              ts: new Date().toISOString(),
            },
          });
        }
      }
    } catch (err) {
      console.error('[rn-inspector] Failed to attach DevTools bridge(s):', err);
    }
  };

  uiWss.on('connection', (client) => {
    // Send current devices list on connect, if we have one.
    if (currentDevices.length) {
      try {
        client.send(
          JSON.stringify({
            type: 'meta',
            payload: {
              kind: 'devices',
              devices: currentDevices,
              ts: new Date().toISOString(),
            },
          }),
        );
      } catch {
        // ignore per-client send errors
      }
    }

    client.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'control' && msg.command === 'reconnect-devtools') {
          void attachDevtools();
        }
      } catch {
        // ignore malformed control messages
      }
    });
  });

  await attachDevtools();

  metroWs.on('message', (data: RawData) => {
    const raw = data.toString();
    const evt = { type: 'console', payload: { ts: new Date().toISOString(), level: 'info', msg: raw, origin: 'metro' } };
    broadcast(evt);
  });

  metroWs.on('close', () => {
    console.warn('[rn-inspector] Metro websocket closed');
    try {
      broadcast({
        type: 'meta',
        payload: {
          source: 'metro',
          status: 'closed',
          level: 'error',
          message: 'Metro websocket closed. Is the Metro bundler still running?',
          ts: new Date().toISOString(),
        },
      });
    } catch {
      // ignore broadcast errors
    }
  });

  metroWs.on('error', (err: Error) => {
    console.error('[rn-inspector] Metro websocket error:', err);
    try {
      broadcast({
        type: 'meta',
        payload: {
          source: 'metro',
          status: 'error',
          level: 'error',
          message: 'Metro websocket error. Check Metro bundler status.',
          ts: new Date().toISOString(),
        },
      });
    } catch {
      // ignore broadcast errors
    }
  });

  const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uiWs: `ws://${host}:${uiPort}/inspector` }));
  });

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log('[rn-inspector] Local proxy health endpoint on', address);

  return { metroWs, uiWss, server, devtoolsWs };
}

function startStaticUi(staticPort: number) {
  const staticDir = path.resolve(baseDir, '../ui');
  const serve = serveStatic(staticDir);
  const server = http.createServer((req, res) => {
    serve(req as any, res as any, finalhandler(req as any, res as any));
  });
  server.listen(staticPort, () => {
    console.log(`[rn-inspector] UI served at http://localhost:${staticPort}`);
  });
  return server;
}

function openInBrowser(url: string) {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      // On Windows, use "start" through cmd.exe
      const child = spawn('cmd', ['/c', 'start', '""', url], {
        stdio: 'ignore',
        detached: true,
      });
      child.unref();
    } else if (platform === 'darwin') {
      const child = spawn('open', [url], { stdio: 'ignore', detached: true });
      child.unref();
    } else {
      const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
      child.unref();
    }
  } catch (err) {
    console.error('[rn-inspector] Failed to open browser:', err);
  }
}

function registerKeyHandlers(uiUrl: string) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return;
  }

  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    console.log("[rn-inspector] Keyboard shortcuts: 'o' = open UI, 'r' = show reload hint, Ctrl+C = quit");

    process.stdin.on('data', (chunk: string) => {
      const key = chunk.toString();

      if (key === 'o' || key === 'O') {
        console.log('[rn-inspector] Opening UI in browser...');
        openInBrowser(uiUrl);
      } else if (key === 'r' || key === 'R') {
        console.log(
          '[rn-inspector] Reload requested. To fully reload the CLI, press Ctrl+C to stop it and then run `rn-inspector` again.',
        );
      } else if (key === '\u0003') {
        // Ctrl+C
        process.exit(0);
      }
    });
  } catch (err) {
    console.error('[rn-inspector] Failed to register key handlers:', err);
  }
}

export async function main() {
  const { metroPort, uiPort, uiWsPort, devtoolsWsUrl: explicitDevtoolsWsUrl } = parseArgs();

  const devtoolsWsUrl = explicitDevtoolsWsUrl;

  console.log(
    `[rn-inspector] starting proxy (Metro ${metroPort}, UI WS ${uiWsPort ?? DEFAULT_UI_WS_PORT})`,
  );
  if (devtoolsWsUrl) {
    console.log(`[rn-inspector] DevTools endpoint: ${devtoolsWsUrl}`);
  }
  await startProxy({ metroPort, uiWsPort, devtoolsWsUrl });

  console.log('[rn-inspector] serving UI assets...');
  startStaticUi(uiPort);

  const uiUrl = `http://localhost:${uiPort}`;
  console.log(
    `[rn-inspector] open ${uiUrl} (UI connects to ws://localhost:${uiWsPort ?? DEFAULT_UI_WS_PORT}/inspector)`,
  );

  registerKeyHandlers(uiUrl);
}

main().catch((err) => {
  console.error('[rn-inspector] CLI failed:', err);
  process.exit(1);
});
