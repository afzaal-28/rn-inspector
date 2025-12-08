#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import { spawn } from 'child_process';
import { INJECT_INSPECTOR_SNIPPET } from './snippets/INJECT_INSPECTOR_SNIPPET';
import { INJECT_NETWORK_SNIPPET } from './snippets/INJECT_NETWORK_SNIPPET';
import { INJECT_STORAGE_SNIPPET } from './snippets/INJECT_STORAGE_SNIPPET';
import {
  DEFAULT_METRO_PORT,
  DEFAULT_UI_WS_PORT,
  DEFAULT_UI_STATIC_PORT,
  baseDir,
  getCliVersion,
  getMetroPort,
} from './config/Index';

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
  const parsed: {
    metroPort: number;
    uiWsPort: number;
    uiPort: number;
    devtoolsWsUrl?: string;
    showVersion?: boolean;
  } = {
    metroPort: DEFAULT_METRO_PORT,
    uiWsPort: DEFAULT_UI_WS_PORT,
    uiPort: DEFAULT_UI_STATIC_PORT,
    devtoolsWsUrl: process.env.RN_INSPECTOR_DEVTOOLS_URL,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--version' || arg === '-v' || arg === 'version') {
      parsed.showVersion = true;
    } else if (arg === '--port' && next && !next.startsWith('-')) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.metroPort = val;
      i += 1;
    } else if (arg.startsWith('--port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.metroPort = val;
    } else if (arg === '--ui-port' && next && !next.startsWith('-')) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.uiPort = val;
      i += 1;
    } else if (arg.startsWith('--ui-port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.uiPort = val;
    } else if (arg === '--ui-ws-port' && next && !next.startsWith('-')) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.uiWsPort = val;
      i += 1;
    } else if (arg.startsWith('--ui-ws-port=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val)) parsed.uiWsPort = val;
    } else if (arg === '--devtools-url' && next && !next.startsWith('-')) {
      if (next) parsed.devtoolsWsUrl = next;
      i += 1;
    } else if (arg.startsWith('--devtools-url=')) {
      const val = arg.split('=')[1];
      if (val) parsed.devtoolsWsUrl = val;
    }
  }
  if (process.env.METRO_PORT) {
    const v = Number(process.env.METRO_PORT);
    if (!Number.isNaN(v)) parsed.metroPort = v;
  }
  return parsed;
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
type NetworkResourceType = 'fetch' | 'xhr' | 'doc' | 'css' | 'js' | 'font' | 'img' | 'media' | 'socket' | 'other';

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
  source?: string;
  resourceType?: NetworkResourceType;
};

type DevtoolsState = {
  requests: Map<string, TrackedRequest>;
};

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

function handleInjectedStorageFromConsole(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
): boolean {
  if (!params || !Array.isArray(params.args) || params.args.length === 0) return false;
  const first = params.args[0];
  const raw = typeof first.value === 'string' ? first.value : undefined;
  if (!raw || !raw.startsWith('__RN_INSPECTOR_STORAGE__')) return false;

  const rest = raw.slice('__RN_INSPECTOR_STORAGE__'.length);
  const trimmed = rest.trim().startsWith(':') ? rest.trim().slice(1).trim() : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true;
  }

  broadcast({
    type: 'storage',
    payload: {
      requestId: payload.requestId,
      asyncStorage: payload.asyncStorage,
      redux: payload.redux,
      error: payload.error,
      deviceId,
      ts: new Date().toISOString(),
    },
  });

  return true;
}

function handleInjectedUIFromConsole(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
): boolean {
  if (!params || !Array.isArray(params.args) || params.args.length === 0) return false;
  const first = params.args[0];
  const raw = typeof first.value === 'string' ? first.value : undefined;
  if (!raw || !raw.startsWith('__RN_INSPECTOR_UI__')) return false;

  const rest = raw.slice('__RN_INSPECTOR_UI__'.length);
  const trimmed = rest.trim().startsWith(':') ? rest.trim().slice(1).trim() : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true;
  }

  broadcast({
    type: 'inspector',
    payload: {
      requestId: payload.requestId,
      hierarchy: payload.hierarchy,
      screenshot: payload.screenshot,
      error: payload.error,
      deviceId,
      ts: new Date().toISOString(),
    },
  });

  return true;
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
    return true;
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
      source: typeof payload.source === 'string' ? payload.source : undefined,
      resourceType: typeof payload.resourceType === 'string' ? payload.resourceType as NetworkResourceType : undefined,
    };
    map.set(id, req);
    const ts =
      typeof payload.ts === 'string' ? payload.ts : new Date(req.startTimeMs).toISOString();
    broadcast({
      type: 'network',
      payload: {
        id,
        phase: 'start',
        ts,
        method: req.method,
        url: req.url,
        status: undefined,
        durationMs: 0,
        error: undefined,
        requestHeaders: req.requestHeaders,
        responseHeaders: undefined,
        requestBody: req.requestBody,
        responseBody: undefined,
        deviceId,
        source: req.source,
        resourceType: req.resourceType,
      },
    });
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
    if (typeof payload.source === 'string') {
      existing.source = payload.source;
    }
    if (typeof payload.resourceType === 'string') {
      existing.resourceType = payload.resourceType as NetworkResourceType;
    }

    const event = {
      type: 'network',
      payload: {
        id,
        phase: phase === 'error' ? 'error' : 'end',
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
        source: existing.source,
        resourceType: existing.resourceType,
      },
    };
    broadcast(event);
    map.delete(id);
  }

  return true;
}

function stringifyConsoleArgs(args: any[] | undefined): string {
  if (!Array.isArray(args) || args.length === 0) return '';
  return args
    .map((arg) => {
      if (!arg) return 'undefined';
      if (typeof arg.value !== 'undefined') return String(arg.value);
      if (arg.preview && Array.isArray(arg.preview.properties)) {
        try {
          const parts = (arg.preview.properties as any[]).map((p) => {
            const name = String(p.name ?? '');
            const value = typeof p.value !== 'undefined' ? String(p.value) : String(p.type ?? '');
            return `${name}: ${value}`;
          });
          return `{ ${parts.join(', ')} }`;
        } catch {
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

function stringifyConsoleValues(values: unknown[] | undefined): string {
  if (!Array.isArray(values) || values.length === 0) return '';
  return values
    .map((v) => {
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .join(' ');
}

function normalizePreviewProperty(prop: any): unknown {
  if (!prop) return null;
  
  if (typeof prop.value !== 'undefined') {
    if (typeof prop.value === 'string') {
      try {
        return JSON.parse(prop.value);
      } catch {
        return prop.value;
      }
    }
    return prop.value;
  }

  if (prop.subtype === 'array' && typeof prop.description === 'string') {
    return prop.description;
  }
  
  if (typeof prop.type !== 'undefined') {
    return `[${prop.type}]`;
  }
  
  return null;
}

function normalizeConsoleArg(arg: any): unknown {
  if (!arg) return null;

  if (typeof arg.value !== 'undefined') {
    if (typeof arg.value === 'string') {
      try {
        return JSON.parse(arg.value);
      } catch {
        return arg.value;
      }
    }
    return arg.value;
  }

  if (arg.subtype === 'array' && arg.preview) {
    const preview = arg.preview;
    if (Array.isArray(preview.properties)) {
      try {
        const arr: unknown[] = [];
        (preview.properties as any[]).forEach((p) => {
          const idx = parseInt(p.name, 10);
          if (!isNaN(idx)) {
            arr[idx] = normalizePreviewProperty(p);
          }
        });
        if (preview.overflow) {
          arr.push('...[truncated]');
        }
        return arr;
      } catch {
      }
    }
  }

  if (arg.preview && Array.isArray(arg.preview.properties)) {
    try {
      const out: Record<string, unknown> = {};
      (arg.preview.properties as any[]).forEach((p) => {
        const name = String(p.name ?? '');
        out[name] = normalizePreviewProperty(p);
      });
      if (arg.preview.overflow) {
        out['...'] = '[truncated]';
      }
      return out;
    } catch {
    }
  }

  if (typeof arg.description === 'string') return arg.description;

  try {
    return JSON.parse(JSON.stringify(arg));
  } catch {
    return String(arg);
  }
}

async function handleRuntimeConsole(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
  evaluateConsoleArg?: (arg: any) => Promise<unknown>,
) {
  if (!params) return;
  const tsMs = typeof params.timestamp === 'number' ? params.timestamp * 1000 : Date.now();
  const argsArray = Array.isArray(params.args) ? params.args : [];

  let rawArgs: unknown[];
  if (evaluateConsoleArg) {
    // No limit on args - capture all console arguments
    rawArgs = await Promise.all(
      argsArray.map(async (a: any) => {
        try {
          return await evaluateConsoleArg(a);
        } catch {
          return normalizeConsoleArg(a);
        }
      }),
    );
  } else {
    rawArgs = argsArray.map((a: any) => normalizeConsoleArg(a));
  }

  const msg = evaluateConsoleArg && rawArgs.length
    ? stringifyConsoleValues(rawArgs)
    : stringifyConsoleArgs(argsArray);

  const evt = {
    type: 'console',
    payload: {
      ts: new Date(tsMs).toISOString(),
      level: mapConsoleLevel(typeof params.type === 'string' ? params.type : undefined),
      msg,
      origin: 'devtools',
      deviceId,
      rawArgs,
      rawCdpArgs: argsArray,
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

function detectResourceTypeFromCDP(
  url: string,
  contentType: string | undefined,
  cdpResourceType: string | undefined,
): NetworkResourceType {
  const urlLower = (url || '').toLowerCase();
  const ctLower = (contentType || '').toLowerCase();
  const cdpType = (cdpResourceType || '').toLowerCase();

  // CDP resource type mapping
  if (cdpType === 'websocket') return 'socket';
  if (cdpType === 'image') return 'img';
  if (cdpType === 'font') return 'font';
  if (cdpType === 'stylesheet') return 'css';
  if (cdpType === 'script') return 'js';
  if (cdpType === 'media') return 'media';
  if (cdpType === 'document') return 'doc';
  if (cdpType === 'xhr') return 'xhr';
  if (cdpType === 'fetch') return 'fetch';

  // Content-type based detection
  if (ctLower.includes('image/')) return 'img';
  if (ctLower.includes('font/') || ctLower.includes('application/font')) return 'font';
  if (ctLower.includes('text/css')) return 'css';
  if (ctLower.includes('javascript') || ctLower.includes('text/javascript')) return 'js';
  if (ctLower.includes('video/') || ctLower.includes('audio/')) return 'media';
  if (ctLower.includes('text/html') || ctLower.includes('application/xhtml')) return 'doc';
  if (ctLower.includes('application/json')) return 'fetch';

  // URL extension based detection
  const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif'];
  for (const ext of imgExts) if (urlLower.includes(ext)) return 'img';

  const fontExts = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
  for (const ext of fontExts) if (urlLower.includes(ext)) return 'font';

  if (urlLower.includes('.css')) return 'css';

  const jsExts = ['.js', '.mjs', '.jsx', '.ts', '.tsx'];
  for (const ext of jsExts) if (urlLower.includes(ext)) return 'js';

  const mediaExts = ['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a', '.m3u8', '.mpd'];
  for (const ext of mediaExts) if (urlLower.includes(ext)) return 'media';

  const docExts = ['.html', '.htm', '.pdf', '.xml'];
  for (const ext of docExts) if (urlLower.includes(ext)) return 'doc';

  return 'other';
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
    const hadExisting = map.has(id);
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
    // Detect resource type from CDP type
    const cdpType = typeof params.type === 'string' ? params.type : undefined;
    existing.resourceType = detectResourceTypeFromCDP(existing.url, undefined, cdpType);
    existing.source = cdpType?.toLowerCase() === 'xhr' ? 'xhr' : 'fetch';
    map.set(id, existing);
    if (!hadExisting) {
      const ts = new Date(existing.startTimeMs).toISOString();
      broadcast({
        type: 'network',
        payload: {
          id,
          phase: 'start',
          ts,
          method: existing.method,
          url: existing.url,
          status: existing.status,
          durationMs: 0,
          error: undefined,
          requestHeaders: existing.requestHeaders,
          responseHeaders: existing.responseHeaders,
          requestBody: existing.requestBody,
          responseBody: existing.responseBody,
          deviceId,
          source: existing.source,
          resourceType: existing.resourceType,
        },
      });
    }
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
    // Update resource type with content-type info if not already set
    const contentType = respHeaders?.['content-type'] || respHeaders?.['Content-Type'];
    if (contentType && !existing.resourceType) {
      existing.resourceType = detectResourceTypeFromCDP(existing.url, contentType, undefined);
    }
    map.set(id, existing);
    const ts = new Date(existing.startTimeMs).toISOString();
    broadcast({
      type: 'network',
      payload: {
        id,
        phase: 'response',
        ts,
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
        source: existing.source,
        resourceType: existing.resourceType,
      },
    });
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
        id,
        phase: method === 'Network.loadingFailed' ? 'error' : 'end',
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
        source: existing.source,
        resourceType: existing.resourceType,
      },
    };
    broadcast(event);
    map.delete(id);
  }
}

type DevtoolsBridge = {
  ws: WebSocket;
  deviceId: string;
  requestStorage: (requestId: string) => void;
  requestUI: (requestId: string) => void;
};

function attachDevtoolsBridge(
  devtoolsWsUrl: string,
  broadcast: (message: unknown) => void,
  deviceId: string,
): DevtoolsBridge {
  const state: DevtoolsState = { requests: new Map() };
  let devtoolsWs: WebSocket | null = null;
  let nextStorageRequestId = 1000;

  let nextConsoleEvalId = 100;
  const pendingConsoleEvals = new Map<number, (value: unknown) => void>();

  const evaluateConsoleArg = async (arg: any): Promise<unknown> => {
    if (!arg || typeof arg !== 'object' || !arg.objectId) {
      return normalizeConsoleArg(arg);
    }

    const ws = devtoolsWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return normalizeConsoleArg(arg);
    }

    const id = nextConsoleEvalId++;
    // Full deep serialization - no truncation, unlimited depth for complete console capture
    const serializeFn = `function() {
      try {
        var seen = new WeakSet();
        var maxDepth = 50;
        var maxArrayLength = 10000;
        var maxObjectKeys = 10000;
        
        function serialize(obj, depth) {
          if (depth > maxDepth) return '[Max depth reached]';
          if (obj === null) return null;
          if (obj === undefined) return undefined;
          
          var type = typeof obj;
          if (type === 'string') return obj;
          if (type === 'number') return isNaN(obj) ? 'NaN' : isFinite(obj) ? obj : (obj > 0 ? 'Infinity' : '-Infinity');
          if (type === 'boolean') return obj;
          if (type === 'function') return '[Function: ' + (obj.name || 'anonymous') + ']';
          if (type === 'symbol') return obj.toString();
          if (type === 'bigint') return obj.toString() + 'n';
          if (type !== 'object') return String(obj);
          
          if (seen.has(obj)) return '[Circular]';
          seen.add(obj);
          
          try {
            if (Array.isArray(obj)) {
              var arr = [];
              var len = Math.min(obj.length, maxArrayLength);
              for (var i = 0; i < len; i++) {
                arr.push(serialize(obj[i], depth + 1));
              }
              if (obj.length > maxArrayLength) {
                arr.push('[... ' + (obj.length - maxArrayLength) + ' more items]');
              }
              return arr;
            }
            
            if (obj instanceof Date) return { __type: 'Date', value: obj.toISOString() };
            if (obj instanceof RegExp) return { __type: 'RegExp', value: obj.toString() };
            if (obj instanceof Error) return { __type: 'Error', name: obj.name, message: obj.message, stack: obj.stack };
            if (obj instanceof Promise) return { __type: 'Promise', state: 'pending' };
            
            if (obj instanceof Map) {
              var mapResult = { __type: 'Map', size: obj.size, entries: {} };
              var mapCount = 0;
              obj.forEach(function(v, k) {
                if (mapCount < maxObjectKeys) {
                  mapResult.entries[String(k)] = serialize(v, depth + 1);
                  mapCount++;
                }
              });
              return mapResult;
            }
            
            if (obj instanceof Set) {
              var setResult = { __type: 'Set', size: obj.size, values: [] };
              var setCount = 0;
              obj.forEach(function(v) {
                if (setCount < maxArrayLength) {
                  setResult.values.push(serialize(v, depth + 1));
                  setCount++;
                }
              });
              return setResult;
            }
            
            if (obj instanceof WeakMap) return { __type: 'WeakMap' };
            if (obj instanceof WeakSet) return { __type: 'WeakSet' };
            
            if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) {
              return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
            }
            if (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) {
              return { __type: 'Uint8Array', length: obj.length, data: Array.from(obj.slice(0, 100)) };
            }
            if (typeof Blob !== 'undefined' && obj instanceof Blob) {
              return { __type: 'Blob', size: obj.size, type: obj.type };
            }
            
            var result = {};
            if (typeof obj.constructor === 'function' && obj.constructor.name && obj.constructor.name !== 'Object') {
              result.__type = obj.constructor.name;
            }
            
            // Use both Object.keys and getOwnPropertyNames for complete enumeration
            var keys = Object.keys(obj);
            try {
              var propNames = Object.getOwnPropertyNames(obj);
              for (var p = 0; p < propNames.length; p++) {
                if (keys.indexOf(propNames[p]) === -1) keys.push(propNames[p]);
              }
            } catch (e) {}
            
            var keyCount = Math.min(keys.length, maxObjectKeys);
            for (var j = 0; j < keyCount; j++) {
              var key = keys[j];
              try {
                var descriptor = Object.getOwnPropertyDescriptor(obj, key);
                if (descriptor && typeof descriptor.get === 'function') {
                  result[key] = '[Getter]';
                } else {
                  result[key] = serialize(obj[key], depth + 1);
                }
              } catch (e) {
                result[key] = '[Error: ' + (e.message || 'Access denied') + ']';
              }
            }
            if (keys.length > maxObjectKeys) {
              result['...'] = '[' + (keys.length - maxObjectKeys) + ' more properties]';
            }
            return result;
          } finally {
            seen.delete(obj);
          }
        }
        return serialize(this, 0);
      } catch (e) { return { __error: e.message, __stack: e.stack }; }
    }`;
    const payload = {
      id,
      method: 'Runtime.callFunctionOn',
      params: {
        objectId: arg.objectId,
        functionDeclaration: serializeFn,
        returnByValue: true,
        awaitPromise: true,
      },
    };

    return new Promise<unknown>((resolve) => {
      pendingConsoleEvals.set(id, (value: unknown) => {
        if (value === null || typeof value === 'undefined') {
          resolve(normalizeConsoleArg(arg));
        } else {
          resolve(value);
        }
      });
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        pendingConsoleEvals.delete(id);
        resolve(normalizeConsoleArg(arg));
        return;
      }

      // Increased timeout to 5 seconds for deep object serialization
      setTimeout(() => {
        if (pendingConsoleEvals.has(id)) {
          pendingConsoleEvals.delete(id);
          resolve(normalizeConsoleArg(arg));
        }
      }, 5000);
    });
  };

  const connect = () => {
    const ws = new WebSocket(devtoolsWsUrl);
    devtoolsWs = ws;

    ws.on('open', () => {
      console.log(`[rn-inspector] Connected to DevTools websocket ${devtoolsWsUrl}`);
      try {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
        ws.send(JSON.stringify({ id: 3, method: 'Network.enable' }));
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
        ws.send(
          JSON.stringify({
            id: 7,
            method: 'Runtime.evaluate',
            params: {
              expression: INJECT_STORAGE_SNIPPET,
              includeCommandLineAPI: false,
              awaitPromise: false,
            },
          }),
        );
        ws.send(
          JSON.stringify({
            id: 8,
            method: 'Runtime.evaluate',
            params: {
              expression: INJECT_INSPECTOR_SNIPPET,
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

      if (msg && typeof msg.id === 'number' && pendingConsoleEvals.has(msg.id)) {
        const resolve = pendingConsoleEvals.get(msg.id)!;
        pendingConsoleEvals.delete(msg.id);
        const value =
          msg && msg.result && typeof msg.result.value !== 'undefined'
            ? msg.result.value
            : null;
        resolve(value);
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
        if (handleInjectedStorageFromConsole(params, broadcast, deviceId)) {
          return;
        }
        if (handleInjectedUIFromConsole(params, broadcast, deviceId)) {
          return;
        }
        void handleRuntimeConsole(params, broadcast, deviceId, evaluateConsoleArg);
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
      }
    });

    return ws;
  };

  const ws = connect();

  const requestStorage = (requestId: string) => {
    if (!devtoolsWs || devtoolsWs.readyState !== WebSocket.OPEN) {
      broadcast({
        type: 'storage',
        payload: {
          requestId,
          asyncStorage: { error: 'DevTools not connected' },
          redux: { error: 'DevTools not connected' },
          deviceId,
          ts: new Date().toISOString(),
        },
      });
      return;
    }
    const evalId = nextStorageRequestId++;
    devtoolsWs.send(
      JSON.stringify({
        id: evalId,
        method: 'Runtime.evaluate',
        params: {
          expression: `(typeof __RN_INSPECTOR_FETCH_STORAGE__ === 'function') ? __RN_INSPECTOR_FETCH_STORAGE__('${requestId}') : console.log('__RN_INSPECTOR_STORAGE__:' + JSON.stringify({ requestId: '${requestId}', asyncStorage: { error: 'Storage helper not injected' }, redux: { error: 'Storage helper not injected' } }))`,
          includeCommandLineAPI: false,
          awaitPromise: false,
        },
      }),
    );
  };

  const requestUI = (requestId: string) => {
    if (!devtoolsWs || devtoolsWs.readyState !== WebSocket.OPEN) {
      broadcast({
        type: 'inspector',
        payload: {
          requestId,
          hierarchy: null,
          screenshot: null,
          error: 'DevTools not connected',
          deviceId,
          ts: new Date().toISOString(),
        },
      });
      return;
    }
    const evalId = nextStorageRequestId++;
    devtoolsWs.send(
      JSON.stringify({
        id: evalId,
        method: 'Runtime.evaluate',
        params: {
          expression: `(typeof __RN_INSPECTOR_FETCH_UI__ === 'function') ? __RN_INSPECTOR_FETCH_UI__('${requestId}') : console.log('__RN_INSPECTOR_UI__:' + JSON.stringify({ requestId: '${requestId}', hierarchy: null, error: 'UI inspector not injected' }))`,
          includeCommandLineAPI: false,
          awaitPromise: false,
        },
      }),
    );
  };

  return { ws, deviceId, requestStorage, requestUI };
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

  const devtoolsBridges = new Map<string, DevtoolsBridge>();

  const attachDevtools = async () => {
    try {
      if (opts.devtoolsWsUrl) {
        const deviceId = 'devtools-explicit';
        console.log(`[rn-inspector] Connecting to DevTools websocket ${opts.devtoolsWsUrl} ...`);
        const bridge = attachDevtoolsBridge(opts.devtoolsWsUrl, broadcast, deviceId);
        devtoolsBridges.set(deviceId, bridge);

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
            const bridge = attachDevtoolsBridge(target.webSocketDebuggerUrl, broadcast, d.id);
            devtoolsBridges.set(d.id, bridge);
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
      }
    }

    client.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'control' && msg.command === 'reconnect-devtools') {
          void attachDevtools();
        } else if (msg.type === 'control' && msg.command === 'fetch-storage') {
          const requestId = msg.requestId || `storage-${Date.now()}`;
          const targetDeviceId = msg.deviceId;
          
          if (targetDeviceId && targetDeviceId !== 'all') {
            const bridge = devtoolsBridges.get(targetDeviceId);
            if (bridge) {
              bridge.requestStorage(requestId);
            } else {
              broadcast({
                type: 'storage',
                payload: {
                  requestId,
                  asyncStorage: { error: `Device ${targetDeviceId} not found` },
                  redux: { error: `Device ${targetDeviceId} not found` },
                  deviceId: targetDeviceId,
                  ts: new Date().toISOString(),
                },
              });
            }
          } else {
            if (devtoolsBridges.size === 0) {
              broadcast({
                type: 'storage',
                payload: {
                  requestId,
                  asyncStorage: { error: 'No devices connected' },
                  redux: { error: 'No devices connected' },
                  deviceId: 'all',
                  ts: new Date().toISOString(),
                },
              });
            } else {
              devtoolsBridges.forEach((bridge) => {
                bridge.requestStorage(`${requestId}-${bridge.deviceId}`);
              });
            }
          }
        } else if (msg.type === 'control' && msg.command === 'fetch-ui') {
          const requestId = msg.requestId || `ui-${Date.now()}`;
          const targetDeviceId = msg.deviceId;
          
          if (targetDeviceId && targetDeviceId !== 'all') {
            const bridge = devtoolsBridges.get(targetDeviceId);
            if (bridge) {
              bridge.requestUI(requestId);
            } else {
              broadcast({
                type: 'inspector',
                payload: {
                  requestId,
                  hierarchy: null,
                  screenshot: null,
                  error: `Device ${targetDeviceId} not found`,
                  deviceId: targetDeviceId,
                  ts: new Date().toISOString(),
                },
              });
            }
          } else {
            if (devtoolsBridges.size === 0) {
              broadcast({
                type: 'inspector',
                payload: {
                  requestId,
                  hierarchy: null,
                  screenshot: null,
                  error: 'No devices connected',
                  deviceId: 'all',
                  ts: new Date().toISOString(),
                },
              });
            } else {
              const firstBridge = devtoolsBridges.values().next().value;
              if (firstBridge) {
                firstBridge.requestUI(requestId);
              }
            }
          }
        }
      } catch {
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
    }
  });

  const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uiWs: `ws://${host}:${uiPort}/inspector` }));
  });

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log('[rn-inspector] Local proxy health endpoint on', address);

  return { metroWs, uiWss, server, devtoolsBridges };
}

function startStaticUi(staticPort: number) {
  const staticDir = path.resolve(baseDir, '../../ui');
  const serve = serveStatic(staticDir);
  const server = http.createServer((req, res) => {
    const done = finalhandler(req as any, res as any);

    serve(req as any, res as any, (err) => {
      if (err) {
        return done(err as any);
      }
      if (req.method === 'GET') {
        const accept = req.headers.accept;
        const acceptsHtml = typeof accept === 'string' && accept.includes('text/html');

        if (acceptsHtml) {
          const indexPath = path.join(staticDir, 'index.html');
          fs.readFile(indexPath, (readErr, data) => {
            if (readErr) {
              return done(readErr as any);
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(data);
          });
          return;
        }
      }
      done();
    });
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
        process.exit(0);
      }
    });
  } catch (err) {
    console.error('[rn-inspector] Failed to register key handlers:', err);
  }
}

export async function main() {
  const { metroPort, uiPort, uiWsPort, devtoolsWsUrl: explicitDevtoolsWsUrl, showVersion } = parseArgs();

  if (showVersion) {
    const version = getCliVersion();
    console.log(version);
    return;
  }

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
