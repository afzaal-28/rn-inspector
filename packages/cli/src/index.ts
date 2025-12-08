#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
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

function getCliVersion(): string {
  try {
    const pkgPath = path.resolve(baseDir, '../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
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

    var pendingRequests = {};
    var xhrIdMap = new WeakMap();

    function logNetwork(payload) {
      try {
        if (typeof console !== 'undefined' && console.log) {
          console.log('__RN_INSPECTOR_NETWORK__:' + JSON.stringify(payload));
        }
      } catch (e) {}
    }

    function toPlainHeaders(headers) {
      var out = {};
      if (!headers) return out;
      try {
        if (typeof headers.forEach === 'function') {
          headers.forEach(function (v, k) { out[k] = String(v); });
        } else if (Array.isArray(headers)) {
          headers.forEach(function (entry) {
            if (Array.isArray(entry) && entry.length >= 2) out[entry[0]] = String(entry[1]);
            else if (entry && typeof entry === 'object' && entry.name) out[entry.name] = String(entry.value || '');
          });
        } else if (typeof headers === 'object') {
          Object.keys(headers).forEach(function (k) { out[k] = String(headers[k]); });
        }
      } catch (e) {}
      return out;
    }

    function truncateBody(text, limit) {
      limit = limit || 500000;
      if (!text) return text;
      if (typeof text !== 'string') {
        try { text = JSON.stringify(text); } catch (e) { text = String(text); }
      }
      return text.length > limit ? text.slice(0, limit) + '... [truncated]' : text;
    }

    function genId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    // ============ FETCH SHIM ============
    var originalFetch = g.fetch;
    if (typeof originalFetch === 'function') {
      g.fetch = function (input, init) {
        var id = genId();
        var start = Date.now();
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method) || (input && input.method) || 'GET';
        var requestHeaders = toPlainHeaders((init && init.headers) || (input && input.headers));
        var requestBody = init && typeof init.body !== 'undefined' ? init.body : undefined;

        logNetwork({
          id: id, phase: 'start', ts: new Date().toISOString(),
          method: method, url: url, durationMs: 0,
          requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
          source: 'fetch'
        });

        return originalFetch(input, init)
          .then(function (res) {
            var responseHeaders = toPlainHeaders(res && res.headers);
            var clone;
            try { clone = res && res.clone ? res.clone() : null; } catch (e) { clone = null; }

            if (!clone || typeof clone.text !== 'function') {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), source: 'fetch'
              });
              return res;
            }

            return clone.text().then(function (text) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), responseBody: truncateBody(text),
                source: 'fetch'
              });
              return res;
            }).catch(function () {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: method, url: url, status: res && res.status,
                durationMs: Date.now() - start,
                requestHeaders: requestHeaders, responseHeaders: responseHeaders,
                requestBody: truncateBody(requestBody), source: 'fetch'
              });
              return res;
            });
          })
          .catch(function (error) {
            logNetwork({
              id: id, phase: 'error', ts: new Date().toISOString(),
              method: method, url: url, durationMs: Date.now() - start,
              requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
              error: String(error && error.message ? error.message : error),
              source: 'fetch'
            });
            throw error;
          });
      };
    }

    // ============ XHR SHIM ============
    var OriginalXHR = g.XMLHttpRequest;
    if (OriginalXHR && typeof OriginalXHR === 'function') {
      g.XMLHttpRequest = function () {
        var xhr = new OriginalXHR();
        var id = genId();
        var method = 'GET';
        var url = '';
        var start = 0;
        var requestHeaders = {};
        var requestBody;
        var logged = false;

        var origOpen = xhr.open;
        xhr.open = function (m, u) {
          method = m || 'GET';
          url = u || '';
          return origOpen.apply(xhr, arguments);
        };

        var origSetRequestHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = function (k, v) {
          try { requestHeaders[k] = v; } catch (e) {}
          return origSetRequestHeader.apply(xhr, arguments);
        };

        var origSend = xhr.send;
        xhr.send = function (body) {
          requestBody = body;
          start = Date.now();
          logNetwork({
            id: id, phase: 'start', ts: new Date().toISOString(),
            method: method, url: url, durationMs: 0,
            requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
            source: 'xhr'
          });
          return origSend.apply(xhr, arguments);
        };

        function logEnd() {
          if (logged) return;
          logged = true;
          var responseHeaders = {};
          try {
            var raw = xhr.getAllResponseHeaders();
            if (raw) {
              raw.trim().split(/\\r?\\n/).forEach(function (line) {
                var idx = line.indexOf(':');
                if (idx > 0) {
                  responseHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
                }
              });
            }
          } catch (e) {}

          logNetwork({
            id: id, phase: xhr.status === 0 ? 'error' : 'end',
            ts: new Date().toISOString(),
            method: method, url: url, status: xhr.status || undefined,
            durationMs: Date.now() - (start || Date.now()),
            requestHeaders: requestHeaders, responseHeaders: responseHeaders,
            requestBody: truncateBody(requestBody),
            responseBody: truncateBody(xhr.responseText),
            error: xhr.status === 0 ? 'XHR failed' : undefined,
            source: 'xhr'
          });
        }

        xhr.addEventListener('loadend', logEnd);
        xhr.addEventListener('error', function (e) {
          if (logged) return;
          logged = true;
          logNetwork({
            id: id, phase: 'error', ts: new Date().toISOString(),
            method: method, url: url, durationMs: Date.now() - (start || Date.now()),
            requestHeaders: requestHeaders, requestBody: truncateBody(requestBody),
            error: e && e.message ? e.message : 'XHR error',
            source: 'xhr'
          });
        });

        return xhr;
      };
      g.XMLHttpRequest.UNSENT = 0;
      g.XMLHttpRequest.OPENED = 1;
      g.XMLHttpRequest.HEADERS_RECEIVED = 2;
      g.XMLHttpRequest.LOADING = 3;
      g.XMLHttpRequest.DONE = 4;
    }

    // ============ REACT NATIVE NETWORKING MODULE (Low-level native HTTP) ============
    try {
      var RN = require('react-native');
      var NativeModules = RN && RN.NativeModules;
      
      // Patch NativeModules.Networking
      if (NativeModules && NativeModules.Networking) {
        var Networking = NativeModules.Networking;
        
        if (typeof Networking.sendRequest === 'function' && !Networking.__patched) {
          Networking.__patched = true;
          var origSendRequest = Networking.sendRequest.bind(Networking);
          Networking.sendRequest = function (method, trackingName, url, headers, data, responseType, incrementalUpdates, timeout, callback, withCredentials) {
            var id = genId();
            var start = Date.now();
            var reqHeaders = toPlainHeaders(headers);

            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: method || 'GET', url: url || '', durationMs: 0,
              requestHeaders: reqHeaders, requestBody: truncateBody(data),
              source: 'rn-native'
            });

            pendingRequests[id] = { method: method, url: url, start: start, headers: reqHeaders, data: data };

            var wrappedCallback = function (requestId, response) {
              var duration = Date.now() - start;
              var status = response && response.status;
              var respHeaders = toPlainHeaders(response && response.headers);

              logNetwork({
                id: id, phase: status ? 'end' : 'error', ts: new Date().toISOString(),
                method: method || 'GET', url: url || '', status: status,
                durationMs: duration,
                requestHeaders: reqHeaders, responseHeaders: respHeaders,
                requestBody: truncateBody(data),
                responseBody: truncateBody(response && (response.body || response.data)),
                error: !status ? 'Native request failed' : undefined,
                source: 'rn-native'
              });

              delete pendingRequests[id];
              if (callback) callback(requestId, response);
            };

            return origSendRequest(method, trackingName, url, headers, data, responseType, incrementalUpdates, timeout, wrappedCallback, withCredentials);
          };
        }

        // Also patch addListener for response events
        if (typeof Networking.addListener === 'function' && !Networking.__listenerPatched) {
          Networking.__listenerPatched = true;
          var origAddListener = Networking.addListener.bind(Networking);
          Networking.addListener = function (eventType, handler) {
            if (eventType === 'didReceiveNetworkResponse' || eventType === 'didCompleteNetworkResponse') {
              var wrappedHandler = function () {
                try {
                  var args = Array.prototype.slice.call(arguments);
                  if (args[0] && typeof args[0] === 'object') {
                    var evt = args[0];
                    logNetwork({
                      id: 'evt-' + genId(), phase: eventType === 'didCompleteNetworkResponse' ? 'end' : 'response',
                      ts: new Date().toISOString(),
                      method: 'GET', url: evt.url || '', status: evt.status,
                      responseHeaders: toPlainHeaders(evt.headers),
                      responseBody: truncateBody(evt.body || evt.data),
                      source: 'rn-event'
                    });
                  }
                } catch (e) {}
                return handler.apply(this, arguments);
              };
              return origAddListener(eventType, wrappedHandler);
            }
            return origAddListener(eventType, handler);
          };
        }
      }

      // Patch ImageLoader for image requests
      if (NativeModules && NativeModules.ImageLoader) {
        var ImageLoader = NativeModules.ImageLoader;
        
        if (typeof ImageLoader.getSize === 'function' && !ImageLoader.__getSizePatched) {
          ImageLoader.__getSizePatched = true;
          var origGetSize = ImageLoader.getSize.bind(ImageLoader);
          ImageLoader.getSize = function (url) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'image-loader'
            });

            return origGetSize(url).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify(result),
                source: 'image-loader'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'image-loader'
              });
              throw error;
            });
          };
        }

        if (typeof ImageLoader.prefetchImage === 'function' && !ImageLoader.__prefetchPatched) {
          ImageLoader.__prefetchPatched = true;
          var origPrefetch = ImageLoader.prefetchImage.bind(ImageLoader);
          ImageLoader.prefetchImage = function (url, requestId) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'image-prefetch'
            });

            return origPrefetch(url, requestId).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                source: 'image-prefetch'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'image-prefetch'
              });
              throw error;
            });
          };
        }

        if (typeof ImageLoader.queryCache === 'function' && !ImageLoader.__queryCachePatched) {
          ImageLoader.__queryCachePatched = true;
          var origQueryCache = ImageLoader.queryCache.bind(ImageLoader);
          ImageLoader.queryCache = function (urls) {
            var id = genId();
            var start = Date.now();
            var urlList = Array.isArray(urls) ? urls.join(', ') : String(urls);
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'CACHE', url: urlList.slice(0, 200), durationMs: 0,
              source: 'image-cache'
            });

            return origQueryCache(urls).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'CACHE', url: urlList.slice(0, 200), status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify(result),
                source: 'image-cache'
              });
              return result;
            });
          };
        }
      }

      // Patch BlobModule for file uploads
      if (NativeModules && NativeModules.BlobModule) {
        var BlobModule = NativeModules.BlobModule;
        if (typeof BlobModule.sendOverSocket === 'function' && !BlobModule.__patched) {
          BlobModule.__patched = true;
          var origSendOverSocket = BlobModule.sendOverSocket.bind(BlobModule);
          BlobModule.sendOverSocket = function (blob, socketId) {
            logNetwork({
              id: genId(), phase: 'start', ts: new Date().toISOString(),
              method: 'BLOB', url: 'socket://' + socketId, durationMs: 0,
              requestBody: JSON.stringify({ size: blob && blob.size, type: blob && blob.type }),
              source: 'blob'
            });
            return origSendOverSocket(blob, socketId);
          };
        }
      }

      // Patch FileReaderModule
      if (NativeModules && NativeModules.FileReaderModule) {
        var FileReader = NativeModules.FileReaderModule;
        if (typeof FileReader.readAsDataURL === 'function' && !FileReader.__patched) {
          FileReader.__patched = true;
          var origReadAsDataURL = FileReader.readAsDataURL.bind(FileReader);
          FileReader.readAsDataURL = function (blob) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'READ', url: 'file://blob', durationMs: 0,
              source: 'file-reader'
            });

            return origReadAsDataURL(blob).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'READ', url: 'file://blob', status: 200,
                durationMs: Date.now() - start,
                responseBody: result ? result.slice(0, 100) + '...' : '',
                source: 'file-reader'
              });
              return result;
            });
          };
        }
      }
    } catch (e) {}

    // ============ WEBSOCKET SHIM ============
    try {
      var OriginalWebSocket = g.WebSocket;
      if (OriginalWebSocket && typeof OriginalWebSocket === 'function') {
        g.WebSocket = function (url, protocols) {
          var ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
          var id = genId();
          var start = Date.now();
          var messageCount = 0;

          logNetwork({
            id: id, phase: 'start', ts: new Date().toISOString(),
            method: 'WS', url: url || '', durationMs: 0,
            source: 'websocket'
          });

          ws.addEventListener('open', function () {
            logNetwork({
              id: id, phase: 'end', ts: new Date().toISOString(),
              method: 'WS', url: url || '', status: 101,
              durationMs: Date.now() - start,
              source: 'websocket'
            });
          });

          ws.addEventListener('message', function (e) {
            messageCount++;
            if (messageCount <= 10 || messageCount % 100 === 0) {
              logNetwork({
                id: id + '-msg-' + messageCount, phase: 'end', ts: new Date().toISOString(),
                method: 'WS-MSG', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: truncateBody(e.data, 10000),
                source: 'ws-message'
              });
            }
          });

          ws.addEventListener('error', function (e) {
            logNetwork({
              id: id + '-err', phase: 'error', ts: new Date().toISOString(),
              method: 'WS', url: url || '', durationMs: Date.now() - start,
              error: 'WebSocket error',
              source: 'websocket'
            });
          });

          ws.addEventListener('close', function (e) {
            logNetwork({
              id: id + '-close', phase: 'end', ts: new Date().toISOString(),
              method: 'WS-CLOSE', url: url || '', status: e.code || 1000,
              durationMs: Date.now() - start,
              responseBody: 'Closed: ' + (e.reason || 'normal') + ' (messages: ' + messageCount + ')',
              source: 'websocket'
            });
          });

          // Also intercept send
          var origSend = ws.send;
          ws.send = function (data) {
            logNetwork({
              id: id + '-send-' + genId(), phase: 'start', ts: new Date().toISOString(),
              method: 'WS-SEND', url: url || '', durationMs: 0,
              requestBody: truncateBody(data, 10000),
              source: 'ws-send'
            });
            return origSend.call(ws, data);
          };

          return ws;
        };
        g.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
        g.WebSocket.OPEN = OriginalWebSocket.OPEN;
        g.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
        g.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      }
    } catch (e) {}

    // ============ REACT NATIVE IMAGE COMPONENT ============
    try {
      var Image = require('react-native').Image;
      if (Image) {
        if (typeof Image.prefetch === 'function' && !Image.__prefetchPatched) {
          Image.__prefetchPatched = true;
          var origImgPrefetch = Image.prefetch;
          Image.prefetch = function (url) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'Image.prefetch'
            });

            return origImgPrefetch.call(Image, url).then(function (result) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                source: 'Image.prefetch'
              });
              return result;
            }).catch(function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'Image.prefetch'
              });
              throw error;
            });
          };
        }

        if (typeof Image.getSize === 'function' && !Image.__getSizePatched) {
          Image.__getSizePatched = true;
          var origImgGetSize = Image.getSize;
          Image.getSize = function (url, success, failure) {
            var id = genId();
            var start = Date.now();
            logNetwork({
              id: id, phase: 'start', ts: new Date().toISOString(),
              method: 'GET', url: url || '', durationMs: 0,
              source: 'Image.getSize'
            });

            return origImgGetSize.call(Image, url, function (width, height) {
              logNetwork({
                id: id, phase: 'end', ts: new Date().toISOString(),
                method: 'GET', url: url || '', status: 200,
                durationMs: Date.now() - start,
                responseBody: JSON.stringify({ width: width, height: height }),
                source: 'Image.getSize'
              });
              if (success) success(width, height);
            }, function (error) {
              logNetwork({
                id: id, phase: 'error', ts: new Date().toISOString(),
                method: 'GET', url: url || '', durationMs: Date.now() - start,
                error: String(error && error.message ? error.message : error),
                source: 'Image.getSize'
              });
              if (failure) failure(error);
            });
          };
        }
      }
    } catch (e) {}

  } catch (eOuter) { console.log('RN Inspector network patch error:', eOuter); }
})();`;

const INJECT_STORAGE_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_STORAGE_PATCHED__) return;
    g.__RN_INSPECTOR_STORAGE_PATCHED__ = true;

    function safeSerialize(obj, maxDepth) {
      maxDepth = maxDepth || 100;
      var seen = new WeakSet();
      function serialize(val, depth) {
        if (depth > maxDepth) return '[Max depth ' + depth + ']';
        if (val === null) return null;
        if (val === undefined) return undefined;
        var type = typeof val;
        if (type === 'string') return val;
        if (type === 'number' || type === 'boolean') return val;
        if (type === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
        if (type === 'symbol') return val.toString();
        if (type === 'bigint') return val.toString() + 'n';
        if (type !== 'object') return String(val);
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
        if (Array.isArray(val)) {
          var arr = [];
          for (var i = 0; i < val.length; i++) {
            arr.push(serialize(val[i], depth + 1));
          }
          return arr;
        }
        if (val instanceof Date) return val.toISOString();
        if (val instanceof RegExp) return val.toString();
        if (val instanceof Error) return { __type: 'Error', name: val.name, message: val.message, stack: val.stack };
        var result = {};
        var keys = Object.keys(val);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          try { result[key] = serialize(val[key], depth + 1); } catch (e) { result[key] = '[Error: ' + e.message + ']'; }
        }
        return result;
      }
      return serialize(obj, 0);
    }

    g.__RN_INSPECTOR_FETCH_STORAGE__ = function(requestId) {
      var result = { requestId: requestId, asyncStorage: null, redux: null, error: null };
      
      try {
        var AsyncStorage = null;
        if (g.AsyncStorage) {
          AsyncStorage = g.AsyncStorage;
        } else {
          try {
            var rn = require('@react-native-async-storage/async-storage');
            AsyncStorage = rn.default || rn;
          } catch (e1) {
            try {
              var rn2 = require('react-native');
              AsyncStorage = rn2.AsyncStorage;
            } catch (e2) {}
          }
        }
        
        if (AsyncStorage && typeof AsyncStorage.getAllKeys === 'function') {
          AsyncStorage.getAllKeys().then(function(keys) {
            if (!keys || keys.length === 0) {
              result.asyncStorage = {};
              sendResult();
              return;
            }
            AsyncStorage.multiGet(keys).then(function(pairs) {
              var storage = {};
              (pairs || []).forEach(function(pair) {
                var key = pair[0];
                var value = pair[1];
                try {
                  storage[key] = JSON.parse(value);
                } catch (e) {
                  storage[key] = value;
                }
              });
              result.asyncStorage = safeSerialize(storage, 20);
              sendResult();
            }).catch(function(e) {
              result.asyncStorage = { error: e.message };
              sendResult();
            });
          }).catch(function(e) {
            result.asyncStorage = { error: e.message };
            sendResult();
          });
          return;
        } else {
          result.asyncStorage = { error: 'AsyncStorage not available' };
        }
      } catch (e) {
        result.asyncStorage = { error: e.message };
      }
      
      sendResult();
      
      function sendResult() {
        try {
          if (g.__REDUX_DEVTOOLS_EXTENSION__ && g.__REDUX_DEVTOOLS_EXTENSION__.store) {
            result.redux = safeSerialize(g.__REDUX_DEVTOOLS_EXTENSION__.store.getState(), 20);
          } else if (g.__RN_INSPECTOR_REDUX_STORE__) {
            result.redux = safeSerialize(g.__RN_INSPECTOR_REDUX_STORE__.getState(), 20);
          } else if (g.store && typeof g.store.getState === 'function') {
            result.redux = safeSerialize(g.store.getState(), 20);
          } else {
            result.redux = { error: 'Redux store not found' };
          }
        } catch (e) {
          result.redux = { error: e.message };
        }
        
        console.log('__RN_INSPECTOR_STORAGE__:' + JSON.stringify(result));
      }
    };
  } catch (eOuter) {}
})();`;

const INJECT_INSPECTOR_SNIPPET = `
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this;
    if (!g) return;
    if (g.__RN_INSPECTOR_UI_PATCHED__) return;
    g.__RN_INSPECTOR_UI_PATCHED__ = true;

    function serializeElement(element, depth) {
      if (!element || depth > 15) return null;
      
      var result = {
        type: null,
        props: {},
        children: [],
        layout: null
      };
      
      try {
        if (typeof element.type === 'string') {
          result.type = element.type;
        } else if (element.type && element.type.displayName) {
          result.type = element.type.displayName;
        } else if (element.type && element.type.name) {
          result.type = element.type.name;
        } else if (element.type) {
          result.type = 'Component';
        }
        
        if (element.props) {
          var propKeys = Object.keys(element.props);
          for (var i = 0; i < Math.min(propKeys.length, 20); i++) {
            var key = propKeys[i];
            if (key === 'children') continue;
            var val = element.props[key];
            var valType = typeof val;
            if (valType === 'string' || valType === 'number' || valType === 'boolean') {
              result.props[key] = val;
            } else if (valType === 'function') {
              result.props[key] = '[Function]';
            } else if (val === null) {
              result.props[key] = null;
            } else if (valType === 'object') {
              if (key === 'style') {
                try {
                  result.props[key] = JSON.parse(JSON.stringify(val));
                } catch (e) {
                  result.props[key] = '[Style Object]';
                }
              } else {
                result.props[key] = '[Object]';
              }
            }
          }
        }
        
        if (element.props && element.props.children) {
          var children = element.props.children;
          if (Array.isArray(children)) {
            for (var j = 0; j < Math.min(children.length, 50); j++) {
              var child = serializeElement(children[j], depth + 1);
              if (child) result.children.push(child);
            }
          } else if (typeof children === 'object' && children !== null) {
            var child = serializeElement(children, depth + 1);
            if (child) result.children.push(child);
          } else if (typeof children === 'string' || typeof children === 'number') {
            result.children.push({ type: 'Text', props: { text: String(children) }, children: [] });
          }
        }
      } catch (e) {
        result.error = e.message;
      }
      
      return result;
    }

    g.__RN_INSPECTOR_FETCH_UI__ = function(requestId) {
      var result = { requestId: requestId, hierarchy: null, screenshot: null, error: null };
      
      try {
        var hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && hook.renderers) {
          var renderers = Array.from(hook.renderers.values());
          if (renderers.length > 0) {
            var renderer = renderers[0];
            if (renderer && renderer.findFiberByHostInstance) {
              var roots = hook.getFiberRoots ? hook.getFiberRoots(1) : null;
              if (roots && roots.size > 0) {
                var rootFiber = Array.from(roots)[0];
                if (rootFiber && rootFiber.current) {
                  result.hierarchy = serializeFiber(rootFiber.current, 0);
                }
              }
            }
          }
        }
        
        if (!result.hierarchy) {
          try {
            var AppRegistry = require('react-native').AppRegistry;
            if (AppRegistry && AppRegistry.getRunnable) {
              result.hierarchy = { type: 'AppRoot', props: {}, children: [], note: 'Full hierarchy requires React DevTools hook' };
            }
          } catch (e) {}
        }
        
        if (!result.hierarchy) {
          result.hierarchy = { type: 'Root', props: {}, children: [], note: 'Could not access component tree' };
        }
      } catch (e) {
        result.error = e.message;
      }
      
      console.log('__RN_INSPECTOR_UI__:' + JSON.stringify(result));
      
      function serializeFiber(fiber, depth) {
        if (!fiber || depth > 20) return null;
        
        var node = {
          type: null,
          props: {},
          children: [],
          key: fiber.key || null
        };
        
        try {
          if (typeof fiber.type === 'string') {
            node.type = fiber.type;
          } else if (fiber.type && fiber.type.displayName) {
            node.type = fiber.type.displayName;
          } else if (fiber.type && fiber.type.name) {
            node.type = fiber.type.name;
          } else if (fiber.tag === 5) {
            node.type = 'HostComponent';
          } else if (fiber.tag === 6) {
            node.type = 'Text';
          } else if (fiber.tag === 3) {
            node.type = 'HostRoot';
          } else {
            node.type = 'Unknown';
          }
          
          if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
            var props = fiber.memoizedProps;
            var keys = Object.keys(props);
            for (var i = 0; i < Math.min(keys.length, 15); i++) {
              var key = keys[i];
              if (key === 'children') continue;
              var val = props[key];
              var t = typeof val;
              if (t === 'string' || t === 'number' || t === 'boolean' || val === null) {
                node.props[key] = val;
              } else if (t === 'function') {
                node.props[key] = '[Function]';
              } else if (key === 'style' && t === 'object') {
                try { node.props[key] = JSON.parse(JSON.stringify(val)); } catch (e) { node.props[key] = '[Style]'; }
              } else {
                node.props[key] = '[' + t + ']';
              }
            }
          }
          
          if (fiber.tag === 6 && fiber.memoizedProps) {
            node.props.text = String(fiber.memoizedProps);
          }
          
          var child = fiber.child;
          while (child) {
            var serialized = serializeFiber(child, depth + 1);
            if (serialized) node.children.push(serialized);
            child = child.sibling;
          }
        } catch (e) {
          node.error = e.message;
        }
        
        return node;
      }
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
    const limited = argsArray.slice(0, 10);
    rawArgs = await Promise.all(
      limited.map(async (a: any) => {
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
    // Unlimited serialization - no truncation for console logs
    const serializeFn = `function() {
      try {
        var seen = new WeakSet();
        var maxDepth = 100;
        function serialize(obj, depth) {
          if (depth > maxDepth) return '[Max depth ' + depth + ']';
          if (obj === null) return null;
          if (obj === undefined) return undefined;
          var type = typeof obj;
          if (type === 'string') return obj;
          if (type === 'number' || type === 'boolean') return obj;
          if (type === 'function') return '[Function: ' + (obj.name || 'anonymous') + ']';
          if (type === 'symbol') return obj.toString();
          if (type === 'bigint') return obj.toString() + 'n';
          if (type !== 'object') return String(obj);
          if (seen.has(obj)) return '[Circular]';
          seen.add(obj);
          if (Array.isArray(obj)) {
            var arr = [];
            for (var i = 0; i < obj.length; i++) {
              arr.push(serialize(obj[i], depth + 1));
            }
            return arr;
          }
          if (obj instanceof Date) return obj.toISOString();
          if (obj instanceof RegExp) return obj.toString();
          if (obj instanceof Error) return { __type: 'Error', name: obj.name, message: obj.message, stack: obj.stack };
          if (obj instanceof Map) {
            var mapResult = { __type: 'Map', size: obj.size, entries: {} };
            obj.forEach(function(v, k) { mapResult.entries[String(k)] = serialize(v, depth + 1); });
            return mapResult;
          }
          if (obj instanceof Set) {
            var setResult = { __type: 'Set', size: obj.size, values: [] };
            obj.forEach(function(v) { setResult.values.push(serialize(v, depth + 1)); });
            return setResult;
          }
          if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) {
            return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
          }
          var result = {};
          if (typeof obj.constructor === 'function' && obj.constructor.name && obj.constructor.name !== 'Object') {
            result.__type = obj.constructor.name;
          }
          var keys = Object.keys(obj);
          for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            try { result[key] = serialize(obj[key], depth + 1); } catch (e) { result[key] = '[Error: ' + e.message + ']'; }
          }
          return result;
        }
        return serialize(this, 0);
      } catch (e) { return { error: e.message }; }
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

      setTimeout(() => {
        if (pendingConsoleEvals.has(id)) {
          pendingConsoleEvals.delete(id);
          resolve(normalizeConsoleArg(arg));
        }
      }, 500);
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
  const staticDir = path.resolve(baseDir, '../ui');
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
