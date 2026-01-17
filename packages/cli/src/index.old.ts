#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from "http";
import WebSocket, { RawData, WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import serveStatic from "serve-static";
import finalhandler from "finalhandler";
import { spawn } from "child_process";
import chalk from "chalk";
import { INJECT_INSPECTOR_SNIPPET } from "./snippets/INJECT_INSPECTOR_SNIPPET";
import { INJECT_NETWORK_SNIPPET } from "./snippets/INJECT_NETWORK_SNIPPET";
import { INJECT_STORAGE_SNIPPET } from "./snippets/INJECT_STORAGE_SNIPPET";
import {
  DEFAULT_METRO_PORT,
  DEFAULT_UI_WS_PORT,
  DEFAULT_UI_STATIC_PORT,
  baseDir,
  getCliVersion,
  getMetroPort,
} from "./config/Index";

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

    if (arg === "--version" || arg === "-v" || arg === "version") {
      parsed.showVersion = true;
    } else if (arg === "--port" && next && !next.startsWith("-")) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.metroPort = val;
      i += 1;
    } else if (arg.startsWith("--port=")) {
      const val = Number(arg.split("=")[1]);
      if (!Number.isNaN(val)) parsed.metroPort = val;
    } else if (arg === "--ui-port" && next && !next.startsWith("-")) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.uiPort = val;
      i += 1;
    } else if (arg.startsWith("--ui-port=")) {
      const val = Number(arg.split("=")[1]);
      if (!Number.isNaN(val)) parsed.uiPort = val;
    } else if (arg === "--ui-ws-port" && next && !next.startsWith("-")) {
      const val = Number(next);
      if (!Number.isNaN(val)) parsed.uiWsPort = val;
      i += 1;
    } else if (arg.startsWith("--ui-ws-port=")) {
      const val = Number(arg.split("=")[1]);
      if (!Number.isNaN(val)) parsed.uiWsPort = val;
    } else if (arg === "--devtools-url" && next && !next.startsWith("-")) {
      if (next) parsed.devtoolsWsUrl = next;
      i += 1;
    } else if (arg.startsWith("--devtools-url=")) {
      const val = arg.split("=")[1];
      if (val) parsed.devtoolsWsUrl = val;
    }
  }
  if (process.env.METRO_PORT) {
    const v = Number(process.env.METRO_PORT);
    if (!Number.isNaN(v)) parsed.metroPort = v;
  }
  return parsed;
}

function httpGetJson(
  host: string,
  port: number,
  path: string,
): Promise<unknown | undefined> {
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
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            const json = JSON.parse(text);
            resolve(json);
          } catch {
            resolve(undefined);
          }
        });
      },
    );

    req.on("error", () => {
      resolve(undefined);
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(undefined);
    });
  });
}

function dedupeDevtoolsTargets(targets: DevtoolsTarget[]): DevtoolsTarget[] {
  const map = new Map<string, DevtoolsTarget>();

  targets.forEach((t) => {
    let deviceKey = t.id;
    let page = 0;
    try {
      const urlObj = new URL(t.webSocketDebuggerUrl);
      const deviceParam = urlObj.searchParams.get("device");
      const pageParam = urlObj.searchParams.get("page");
      if (deviceParam) deviceKey = deviceParam;
      if (pageParam) {
        const parsed = Number(pageParam);
        if (!Number.isNaN(parsed)) page = parsed;
      }
    } catch {
      // ignore URL parse errors, fall back to id
    }

    if (!deviceKey)
      deviceKey = t.title || t.description || t.webSocketDebuggerUrl;

    if (!deviceKey) return;

    const existing = map.get(deviceKey);
    const existingPage = existing
      ? (() => {
          try {
            const p = new URL(existing.webSocketDebuggerUrl).searchParams.get(
              "page",
            );
            return p ? Number(p) : 0;
          } catch {
            return 0;
          }
        })()
      : -1;
    if (!existing || page <= existingPage) {
      map.set(deviceKey, t);
    }
  });

  return Array.from(map.values());
}

async function discoverDevtoolsTargets(
  metroPort: number,
): Promise<DevtoolsTarget[]> {
  const host = "127.0.0.1";
  const candidates = new Set<number>();
  candidates.add(metroPort);
  for (let delta = 1; delta <= 10; delta += 1) {
    candidates.add(metroPort + delta);
  }
  [9222, 9229, 9230].forEach((p) => candidates.add(p));

  const results: DevtoolsTarget[] = [];
  const seenUrls = new Set<string>();

  for (const port of candidates) {
    const json = await httpGetJson(host, port, "/json");
    if (!json) continue;

    const tryList = Array.isArray(json)
      ? json
      : Array.isArray((json as any).targets)
        ? (json as any).targets
        : [];

    let index = 0;
    for (const item of tryList) {
      if (item && typeof (item as any).webSocketDebuggerUrl === "string") {
        const url = String((item as any).webSocketDebuggerUrl);

        if (seenUrls.has(url)) {
          index += 1;
          continue;
        }

        seenUrls.add(url);
        const id = String((item as any).id ?? `${port}-${index}`);
        const title =
          typeof (item as any).title === "string"
            ? (item as any).title
            : undefined;
        const description =
          typeof (item as any).description === "string"
            ? (item as any).description
            : undefined;
        results.push({ id, title, description, webSocketDebuggerUrl: url });
        index += 1;
      }
    }
  }

  const deduped = dedupeDevtoolsTargets(results);

  if (deduped.length === 0) {
    console.log(
      chalk.yellow(
        "[rn-inspector] DevTools auto-discovery found no /json targets (falling back to Metro-only mode)",
      ),
    );
  } else {
    if (deduped.length < results.length) {
      console.log(
        chalk.yellow(
          `[rn-inspector] Deduped DevTools targets (kept ${deduped.length} of ${results.length}) — likely duplicate entries for the same device`,
        ),
      );
    }
    console.log(chalk.green("[rn-inspector] Discovered DevTools targets:"));
    deduped.forEach((t, idx) => {
      const label = t.title || t.description || t.id;
      console.log(
        chalk.cyan(`  [${idx}] ${t.webSocketDebuggerUrl} (${label})`),
      );
    });
  }

  return deduped;
}
type NetworkResourceType =
  | "fetch"
  | "xhr"
  | "doc"
  | "css"
  | "js"
  | "font"
  | "img"
  | "media"
  | "socket"
  | "other";

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

function normalizeHeaders(
  input: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
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

function mapConsoleLevel(
  type: string | undefined,
): "log" | "info" | "warn" | "error" {
  if (type === "error") return "error";
  if (type === "warning" || type === "warn") return "warn";
  if (type === "info") return "info";
  return "log";
}

function handleInjectedStorageFromConsole(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
): boolean {
  if (!params || !Array.isArray(params.args) || params.args.length === 0)
    return false;
  const first = params.args[0];
  const raw = typeof first.value === "string" ? first.value : undefined;
  if (!raw || !raw.startsWith("__RN_INSPECTOR_STORAGE__")) return false;

  const rest = raw.slice("__RN_INSPECTOR_STORAGE__".length);
  const trimmed = rest.trim().startsWith(":")
    ? rest.trim().slice(1).trim()
    : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true;
  }

  broadcast({
    type: "storage",
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
  if (!params || !Array.isArray(params.args) || params.args.length === 0)
    return false;
  const first = params.args[0];
  const raw = typeof first.value === "string" ? first.value : undefined;
  if (!raw || !raw.startsWith("__RN_INSPECTOR_UI__")) return false;

  const rest = raw.slice("__RN_INSPECTOR_UI__".length);
  const trimmed = rest.trim().startsWith(":")
    ? rest.trim().slice(1).trim()
    : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true;
  }

  broadcast({
    type: "inspector",
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
  if (!params || !Array.isArray(params.args) || params.args.length === 0)
    return false;
  const first = params.args[0];
  const raw = typeof first.value === "string" ? first.value : undefined;
  if (!raw || !raw.startsWith("__RN_INSPECTOR_NETWORK__")) return false;

  const rest = raw.slice("__RN_INSPECTOR_NETWORK__".length);
  const trimmed = rest.trim().startsWith(":")
    ? rest.trim().slice(1).trim()
    : rest.trim();

  let payload: any;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return true;
  }

  const id = String(payload.id ?? "");
  if (!id) return true;

  const phase = payload.phase;
  const map = state.requests;

  if (phase === "start") {
    const req: TrackedRequest = {
      method: String(payload.method || "GET"),
      url: String(payload.url || ""),
      startTimeMs: Date.now(),
      requestHeaders: payload.requestHeaders as
        | Record<string, string>
        | undefined,
      requestBody: payload.requestBody,
      source: typeof payload.source === "string" ? payload.source : undefined,
      resourceType:
        typeof payload.resourceType === "string"
          ? (payload.resourceType as NetworkResourceType)
          : undefined,
    };
    map.set(id, req);
    const ts =
      typeof payload.ts === "string"
        ? payload.ts
        : new Date(req.startTimeMs).toISOString();
    broadcast({
      type: "network",
      payload: {
        id,
        phase: "start",
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
  } else if (phase === "end" || phase === "error") {
    const existing: TrackedRequest = map.get(id) ?? {
      method: String(payload.method || "GET"),
      url: String(payload.url || ""),
      startTimeMs: Date.now(),
    };
    if (typeof payload.status === "number") existing.status = payload.status;
    if (typeof payload.durationMs === "number") {
      existing.durationMs = payload.durationMs;
    } else {
      existing.durationMs = Date.now() - existing.startTimeMs;
    }
    if (payload.requestHeaders) {
      existing.requestHeaders = payload.requestHeaders as Record<
        string,
        string
      >;
    }
    if (payload.responseHeaders) {
      existing.responseHeaders = payload.responseHeaders as Record<
        string,
        string
      >;
    }
    if (typeof payload.error === "string") existing.error = payload.error;
    if (typeof payload.responseBody !== "undefined") {
      existing.responseBody = payload.responseBody;
    }
    if (typeof payload.source === "string") {
      existing.source = payload.source;
    }
    if (typeof payload.resourceType === "string") {
      existing.resourceType = payload.resourceType as NetworkResourceType;
    }

    const event = {
      type: "network",
      payload: {
        id,
        phase: phase === "error" ? "error" : "end",
        ts:
          typeof payload.ts === "string"
            ? payload.ts
            : new Date(existing.startTimeMs).toISOString(),
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
  if (!Array.isArray(args) || args.length === 0) return "";
  return args
    .map((arg) => {
      if (!arg) return "undefined";
      if (typeof arg.value !== "undefined") return String(arg.value);
      if (arg.preview && Array.isArray(arg.preview.properties)) {
        try {
          const parts = (arg.preview.properties as any[]).map((p) => {
            const name = String(p.name ?? "");
            const value =
              typeof p.value !== "undefined"
                ? String(p.value)
                : String(p.type ?? "");
            return `${name}: ${value}`;
          });
          return `{ ${parts.join(", ")} }`;
        } catch {}
      }
      if (typeof arg.description === "string") return arg.description;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function stringifyConsoleValues(values: unknown[] | undefined): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values
    .map((v) => {
      if (typeof v === "string") return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .join(" ");
}

function normalizePreviewProperty(prop: any): unknown {
  if (!prop) return null;

  if (typeof prop.value !== "undefined") {
    if (typeof prop.value === "string") {
      try {
        return JSON.parse(prop.value);
      } catch {
        return prop.value;
      }
    }
    return prop.value;
  }

  if (prop.subtype === "array" && typeof prop.description === "string") {
    return prop.description;
  }

  if (typeof prop.type !== "undefined") {
    return `[${prop.type}]`;
  }

  return null;
}

function normalizeConsoleArg(arg: any): unknown {
  if (!arg) return null;

  if (typeof arg.value !== "undefined") {
    if (typeof arg.value === "string") {
      try {
        return JSON.parse(arg.value);
      } catch {
        return arg.value;
      }
    }
    return arg.value;
  }

  if (arg.subtype === "array" && arg.preview) {
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
          arr.push("...[truncated]");
        }
        return arr;
      } catch {}
    }
  }

  if (arg.preview && Array.isArray(arg.preview.properties)) {
    try {
      const out: Record<string, unknown> = {};
      (arg.preview.properties as any[]).forEach((p) => {
        const name = String(p.name ?? "");
        out[name] = normalizePreviewProperty(p);
      });
      if (arg.preview.overflow) {
        out["..."] = "[truncated]";
      }
      return out;
    } catch {}
  }

  if (typeof arg.description === "string") return arg.description;

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
  const tsMs =
    typeof params.timestamp === "number" ? params.timestamp * 1000 : Date.now();
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

  const msg =
    evaluateConsoleArg && rawArgs.length
      ? stringifyConsoleValues(rawArgs)
      : stringifyConsoleArgs(argsArray);

  const evt = {
    type: "console",
    payload: {
      ts: new Date(tsMs).toISOString(),
      level: mapConsoleLevel(
        typeof params.type === "string" ? params.type : undefined,
      ),
      msg,
      origin: "devtools",
      deviceId,
      rawArgs,
      rawCdpArgs: argsArray,
    },
  };
  broadcast(evt);
}

function handleLogEntry(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
) {
  if (!params || !params.entry) return;
  const entry = params.entry;
  const tsMs =
    typeof entry.timestamp === "number" ? entry.timestamp * 1000 : Date.now();
  const message =
    typeof entry.text === "string" ? entry.text : JSON.stringify(entry);
  const evt = {
    type: "console",
    payload: {
      ts: new Date(tsMs).toISOString(),
      level: mapConsoleLevel(
        typeof entry.level === "string" ? entry.level : undefined,
      ),
      msg: message,
      origin: "devtools",
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
  const urlLower = (url || "").toLowerCase();
  const ctLower = (contentType || "").toLowerCase();
  const cdpType = (cdpResourceType || "").toLowerCase();

  // CDP resource type mapping
  if (cdpType === "websocket") return "socket";
  if (cdpType === "image") return "img";
  if (cdpType === "font") return "font";
  if (cdpType === "stylesheet") return "css";
  if (cdpType === "script") return "js";
  if (cdpType === "media") return "media";
  if (cdpType === "document") return "doc";
  if (cdpType === "xhr") return "xhr";
  if (cdpType === "fetch") return "fetch";

  // Content-type based detection
  if (ctLower.includes("image/")) return "img";
  if (ctLower.includes("font/") || ctLower.includes("application/font"))
    return "font";
  if (ctLower.includes("text/css")) return "css";
  if (ctLower.includes("javascript") || ctLower.includes("text/javascript"))
    return "js";
  if (ctLower.includes("video/") || ctLower.includes("audio/")) return "media";
  if (ctLower.includes("text/html") || ctLower.includes("application/xhtml"))
    return "doc";
  if (ctLower.includes("application/json")) return "fetch";

  // URL extension based detection
  const imgExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".bmp",
    ".avif",
  ];
  for (const ext of imgExts) if (urlLower.includes(ext)) return "img";

  const fontExts = [".woff", ".woff2", ".ttf", ".otf", ".eot"];
  for (const ext of fontExts) if (urlLower.includes(ext)) return "font";

  if (urlLower.includes(".css")) return "css";

  const jsExts = [".js", ".mjs", ".jsx", ".ts", ".tsx"];
  for (const ext of jsExts) if (urlLower.includes(ext)) return "js";

  const mediaExts = [
    ".mp4",
    ".webm",
    ".ogg",
    ".mp3",
    ".wav",
    ".m4a",
    ".m3u8",
    ".mpd",
  ];
  for (const ext of mediaExts) if (urlLower.includes(ext)) return "media";

  const docExts = [".html", ".htm", ".pdf", ".xml"];
  for (const ext of docExts) if (urlLower.includes(ext)) return "doc";

  return "other";
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

  if (method === "Network.requestWillBeSent") {
    const request = params.request ?? {};
    const nowMs =
      typeof params.wallTime === "number"
        ? params.wallTime * 1000
        : typeof params.timestamp === "number"
          ? params.timestamp * 1000
          : Date.now();
    const hadExisting = map.has(id);
    const existing: TrackedRequest = map.get(id) ?? {
      method: String(request.method || "GET"),
      url: String(request.url || ""),
      startTimeMs: nowMs,
    };
    existing.method = String(request.method || existing.method);
    existing.url = String(request.url || existing.url);
    existing.startTimeMs = nowMs;
    const reqHeaders = normalizeHeaders(
      request.headers as Record<string, unknown> | undefined,
    );
    if (reqHeaders) existing.requestHeaders = reqHeaders;
    if (typeof request.postData === "string") {
      existing.requestBody = tryParseJson(request.postData);
    }
    // Detect resource type from CDP type
    const cdpType = typeof params.type === "string" ? params.type : undefined;
    existing.resourceType = detectResourceTypeFromCDP(
      existing.url,
      undefined,
      cdpType,
    );
    existing.source = cdpType?.toLowerCase() === "xhr" ? "xhr" : "fetch";
    map.set(id, existing);
    if (!hadExisting) {
      const ts = new Date(existing.startTimeMs).toISOString();
      broadcast({
        type: "network",
        payload: {
          id,
          phase: "start",
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
  } else if (method === "Network.responseReceived") {
    const response = params.response ?? {};
    const existing: TrackedRequest = map.get(id) ?? {
      method: "GET",
      url: String(response.url || ""),
      startTimeMs: Date.now(),
    };
    if (typeof response.status === "number") existing.status = response.status;
    const respHeaders = normalizeHeaders(
      response.headers as Record<string, unknown> | undefined,
    );
    if (respHeaders) existing.responseHeaders = respHeaders;
    // Update resource type with content-type info if not already set
    const contentType =
      respHeaders?.["content-type"] || respHeaders?.["Content-Type"];
    if (contentType && !existing.resourceType) {
      existing.resourceType = detectResourceTypeFromCDP(
        existing.url,
        contentType,
        undefined,
      );
    }
    map.set(id, existing);
    const ts = new Date(existing.startTimeMs).toISOString();
    broadcast({
      type: "network",
      payload: {
        id,
        phase: "response",
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
  } else if (
    method === "Network.loadingFinished" ||
    method === "Network.loadingFailed"
  ) {
    const existing = map.get(id);
    if (!existing) return;
    const endMs =
      typeof params.timestamp === "number"
        ? params.timestamp * 1000
        : Date.now();
    existing.durationMs = endMs - existing.startTimeMs;
    if (
      method === "Network.loadingFailed" &&
      typeof params.errorText === "string"
    ) {
      existing.error = params.errorText;
    }
    const event = {
      type: "network",
      payload: {
        id,
        phase: method === "Network.loadingFailed" ? "error" : "end",
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
  devtoolsBridges: Map<string, DevtoolsBridge>,
): DevtoolsBridge {
  const state: DevtoolsState = { requests: new Map() };
  let devtoolsWs: WebSocket | null = null;
  let nextStorageRequestId = 1000;

  let nextConsoleEvalId = 100;
  const pendingConsoleEvals = new Map<number, (value: unknown) => void>();

  const evaluateConsoleArg = async (arg: any): Promise<unknown> => {
    if (!arg || typeof arg !== "object" || !arg.objectId) {
      return normalizeConsoleArg(arg);
    }

    const ws = devtoolsWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return normalizeConsoleArg(arg);
    }

    // Use Runtime.getProperties recursively for deeper object inspection
    return await getDeepObjectProperties(ws, arg.objectId, 0);
  };

  // Recursive function to get deep object properties using Runtime.getProperties
  const getDeepObjectProperties = async (
    ws: WebSocket,
    objectId: string,
    depth: number,
  ): Promise<unknown> => {
    const MAX_DEPTH = 20; // Increased depth for better inspection
    const MAX_PROPERTIES = 500; // Limit properties per level to prevent huge objects

    if (depth > MAX_DEPTH) {
      return { __type: "Object", __depth_limit: "Max depth reached" };
    }

    try {
      const id = nextConsoleEvalId++;
      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingConsoleEvals.delete(id);
          reject(new Error("Runtime.getProperties timeout"));
        }, 3000);

        pendingConsoleEvals.set(id, (value: unknown) => {
          clearTimeout(timeout);
          resolve(value);
        });

        ws.send(
          JSON.stringify({
            id,
            method: "Runtime.getProperties",
            params: {
              objectId,
              ownProperties: true,
              accessorPropertiesOnly: false,
              generatePreview: true,
            },
          }),
        );
      });

      if (!result || !Array.isArray(result.result)) {
        return normalizeConsoleArg({ objectId });
      }

      const properties: Record<string, unknown> = {};
      const processed = new Set<string>();

      for (let i = 0; i < Math.min(result.result.length, MAX_PROPERTIES); i++) {
        const prop = result.result[i];
        if (!prop || !prop.name) continue;

        const name = String(prop.name);
        if (processed.has(name)) continue; // Avoid duplicates
        processed.add(name);

        try {
          if (prop.value) {
            const value = prop.value;

            // Handle different value types
            if (value.type === "undefined") {
              properties[name] = undefined;
            } else if (value.type === "object" && value.subtype === "null") {
              properties[name] = null;
            } else if (
              value.type === "boolean" ||
              value.type === "number" ||
              value.type === "string"
            ) {
              properties[name] = value.value;
            } else if (value.type === "bigint") {
              properties[name] = value.unserializableValue
                ? value.unserializableValue
                : String(value.value);
            } else if (value.type === "symbol") {
              properties[name] = value.description || "[Symbol]";
            } else if (value.type === "function") {
              properties[name] =
                `[Function: ${value.description || "anonymous"}]`;
            } else if (value.type === "object") {
              // Handle special object types
              if (value.subtype === "array") {
                if (value.objectId && depth < MAX_DEPTH - 1) {
                  const arrayProps = await getDeepObjectProperties(
                    ws,
                    value.objectId,
                    depth + 1,
                  );
                  // Convert the properties object back to an array
                  if (typeof arrayProps === "object" && arrayProps !== null) {
                    const propsObj = arrayProps as Record<string, unknown>;

                    // Get array length from the current array's properties, not the parent result
                    const arrayLength = (propsObj["length"] as number) || 0;

                    const resultArray: unknown[] = [];

                    // Extract numeric indices in order
                    for (let i = 0; i < arrayLength; i++) {
                      const key = String(i);
                      if (propsObj[key] !== undefined) {
                        resultArray.push(propsObj[key]);
                      }
                    }

                    properties[name] = resultArray;
                  } else {
                    properties[name] = [];
                  }
                } else {
                  // Use preview for deeper arrays
                  properties[name] = Array.isArray(value.preview?.properties)
                    ? value.preview.properties.map((p: any) => p.value)
                    : [];
                }
              } else if (value.subtype === "date") {
                properties[name] = { __type: "Date", value: value.description };
              } else if (value.subtype === "regexp") {
                properties[name] = {
                  __type: "RegExp",
                  value: value.description,
                };
              } else if (value.subtype === "error") {
                properties[name] = {
                  __type: "Error",
                  name: value.className || "Error",
                  message: value.description || "",
                  stack: value.preview?.properties?.find(
                    (p: any) => p.name === "stack",
                  )?.value,
                };
              } else if (value.subtype === "map") {
                if (value.objectId && depth < MAX_DEPTH - 1) {
                  const mapProps = await getDeepObjectProperties(
                    ws,
                    value.objectId,
                    depth + 1,
                  );
                  properties[name] = { __type: "Map", entries: mapProps };
                } else {
                  properties[name] = {
                    __type: "Map",
                    size:
                      value.preview?.properties?.find(
                        (p: any) => p.name === "size",
                      )?.value || 0,
                  };
                }
              } else if (value.subtype === "set") {
                if (value.objectId && depth < MAX_DEPTH - 1) {
                  const setProps = await getDeepObjectProperties(
                    ws,
                    value.objectId,
                    depth + 1,
                  );
                  properties[name] = { __type: "Set", values: setProps };
                } else {
                  properties[name] = {
                    __type: "Set",
                    size:
                      value.preview?.properties?.find(
                        (p: any) => p.name === "size",
                      )?.value || 0,
                  };
                }
              } else if (value.subtype === "typedarray") {
                properties[name] = {
                  __type: value.className || "TypedArray",
                  length:
                    value.preview?.properties?.find(
                      (p: any) => p.name === "length",
                    )?.value || 0,
                };
              } else if (
                value.subtype === "node" ||
                value.subtype === "window"
              ) {
                properties[name] = {
                  __type: value.subtype,
                  description: value.description,
                };
              } else {
                // Regular object - recurse deeper
                if (value.objectId && depth < MAX_DEPTH - 1) {
                  properties[name] = await getDeepObjectProperties(
                    ws,
                    value.objectId,
                    depth + 1,
                  );
                } else {
                  // Use preview for deeper objects
                  properties[name] = value.preview
                    ? {
                        __type: value.className || "Object",
                        __preview:
                          value.preview.description || value.description,
                        __overflow: value.preview.overflow,
                      }
                    : { __type: value.className || "Object" };
                }
              }
            } else {
              properties[name] =
                value.description || value.unserializableValue || "[Unknown]";
            }
          } else if (prop.get || prop.set) {
            // Handle accessor properties
            properties[name] = {
              __type: "Accessor",
              get: prop.get
                ? `[Getter: ${prop.get.description || "anonymous"}]`
                : undefined,
              set: prop.set
                ? `[Setter: ${prop.set.description || "anonymous"}]`
                : undefined,
            };
          }
        } catch (err) {
          properties[name] =
            `[Error: ${err instanceof Error ? err.message : String(err)}]`;
        }
      }

      // Add metadata about truncation
      if (result.result.length > MAX_PROPERTIES) {
        properties["..."] =
          `[${result.result.length - MAX_PROPERTIES} more properties]`;
      }

      return properties;
    } catch (err) {
      return {
        __error: `Failed to get properties: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };

  const connect = () => {
    const ws = new WebSocket(devtoolsWsUrl);
    devtoolsWs = ws;

    ws.on("open", () => {
      console.log(
        `[rn-inspector] Connected to DevTools websocket ${devtoolsWsUrl}`,
      );
      try {
        ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
        ws.send(JSON.stringify({ id: 2, method: "Log.enable" }));
        ws.send(JSON.stringify({ id: 3, method: "Network.enable" }));
        ws.send(JSON.stringify({ id: 4, method: "Page.enable" }));
        ws.send(
          JSON.stringify({
            id: 5,
            method: "Fetch.enable",
            params: { patterns: [{ urlPattern: "*" }] },
          }),
        );
        ws.send(
          JSON.stringify({
            id: 6,
            method: "Runtime.evaluate",
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
            method: "Runtime.evaluate",
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
            method: "Runtime.evaluate",
            params: {
              expression: INJECT_INSPECTOR_SNIPPET,
              includeCommandLineAPI: false,
              awaitPromise: false,
            },
          }),
        );
        broadcast({
          type: "meta",
          payload: {
            source: "devtools",
            status: "open",
            level: "info",
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error(
          "[rn-inspector] Failed to send DevTools enable commands:",
          err,
        );
      }
    });

    ws.on("message", (data: RawData) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.warn("[rn-inspector] Failed to parse DevTools message", err);
        return;
      }

      if (
        msg &&
        typeof msg.id === "number" &&
        pendingConsoleEvals.has(msg.id)
      ) {
        const resolve = pendingConsoleEvals.get(msg.id)!;
        pendingConsoleEvals.delete(msg.id);

        // Handle different response types: Runtime.getProperties vs Runtime.callFunctionOn
        let value = null;
        if (msg && msg.result) {
          // Runtime.getProperties response: {result: [...]}
          if (Array.isArray(msg.result)) {
            value = msg.result;
          }
          // Runtime.callFunctionOn response: {result: {value: ...}}
          else if (typeof msg.result.value !== "undefined") {
            value = msg.result.value;
          }
          // Fallback to entire result if structure is unexpected
          else {
            value = msg.result;
          }
        }

        resolve(value);
        return;
      }

      if (!msg || typeof msg !== "object") return;
      const method = typeof msg.method === "string" ? msg.method : undefined;
      const params = msg.params as any;

      if (!method) return;

      if (method === "Runtime.consoleAPICalled") {
        if (
          handleInjectedNetworkFromConsole(params, state, broadcast, deviceId)
        ) {
          return;
        }
        if (handleInjectedStorageFromConsole(params, broadcast, deviceId)) {
          return;
        }
        if (handleInjectedUIFromConsole(params, broadcast, deviceId)) {
          return;
        }
        void handleRuntimeConsole(
          params,
          broadcast,
          deviceId,
          evaluateConsoleArg,
        );
      } else if (method === "Log.entryAdded") {
        handleLogEntry(params, broadcast, deviceId);
      } else if (
        method === "Network.requestWillBeSent" ||
        method === "Network.responseReceived" ||
        method === "Network.loadingFinished" ||
        method === "Network.loadingFailed"
      ) {
        handleNetworkEvent(method, params, state, broadcast, deviceId);
      }
    });

    ws.on("close", () => {
      console.warn(chalk.yellow("[rn-inspector] DevTools websocket closed"));
      // Clean up the bridge from the devtoolsBridges Map to prevent stale connections
      devtoolsBridges.delete(deviceId);
      try {
        broadcast({
          type: "meta",
          payload: {
            source: "devtools",
            status: "closed",
            level: "warning",
            message:
              "DevTools websocket closed. If your app was reloaded or stopped, some network/console data may be missing until it reconnects.",
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch {}
    });

    ws.on("error", (err: Error) => {
      console.error("[rn-inspector] DevTools websocket error:", err);
      try {
        broadcast({
          type: "meta",
          payload: {
            source: "devtools",
            status: "error",
            level: "error",
            message:
              "DevTools websocket error. Check Metro / DevTools status in your React Native app.",
            deviceId,
            ts: new Date().toISOString(),
          },
        });
      } catch {}
    });

    return ws;
  };

  const ws = connect();

  const requestStorage = (requestId: string) => {
    if (!devtoolsWs || devtoolsWs.readyState !== WebSocket.OPEN) {
      broadcast({
        type: "storage",
        payload: {
          requestId,
          asyncStorage: { error: "DevTools not connected" },
          redux: { error: "DevTools not connected" },
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
        method: "Runtime.evaluate",
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
        type: "inspector",
        payload: {
          requestId,
          hierarchy: null,
          screenshot: null,
          error: "DevTools not connected",
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
        method: "Runtime.evaluate",
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
  const host = opts.host ?? "127.0.0.1";
  const uiPort = opts.uiWsPort ?? DEFAULT_UI_WS_PORT;

  const targetWsUrl = `ws://${host}:${metroPort}/message`;
  console.log(chalk.cyan(`[rn-inspector] Connecting to ${targetWsUrl} ...`));

  const metroWs = new WebSocket(targetWsUrl);

  metroWs.on("error", (err: Error) => {
    if (err.message.includes("ECONNREFUSED")) {
      console.error(
        chalk.red(
          `[rn-inspector] Error: Could not connect to Metro server on port ${metroPort}`,
        ),
      );
      console.error(
        chalk.yellow(
          `[rn-inspector] Make sure your React Native app is running and Metro is started`,
        ),
      );
      console.error(
        chalk.cyan(
          `[rn-inspector] Try: npx react-native start or npx expo start`,
        ),
      );
      process.exit(1);
    } else {
      console.error(chalk.red(`[rn-inspector] Metro WebSocket error:`), err);
    }
  });

  metroWs.on("open", () => {
    console.log(chalk.green(`[rn-inspector] Connected to Metro websocket`));
  });

  const uiWss = new WebSocketServer({ port: uiPort });
  uiWss.on("listening", () => {
    console.log(
      chalk.blue(
        `[rn-inspector] UI WebSocket server on ws://${host}:${uiPort}/inspector`,
      ),
    );
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
        const deviceId = "devtools-explicit";
        console.log(
          `[rn-inspector] Connecting to DevTools websocket ${opts.devtoolsWsUrl} ...`,
        );
        const bridge = attachDevtoolsBridge(
          opts.devtoolsWsUrl,
          broadcast,
          deviceId,
          devtoolsBridges,
        );
        devtoolsBridges.set(deviceId, bridge);

        currentDevices = [
          {
            id: deviceId,
            label: "DevTools (explicit URL)",
            url: opts.devtoolsWsUrl,
          },
        ];

        broadcast({
          type: "meta",
          payload: {
            kind: "devices",
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
            type: "meta",
            payload: {
              kind: "devices",
              devices: currentDevices,
              ts: new Date().toISOString(),
            },
          });

          devices.forEach((d, index) => {
            const target = targets[index];
            const bridge = attachDevtoolsBridge(
              target.webSocketDebuggerUrl,
              broadcast,
              d.id,
              devtoolsBridges,
            );
            devtoolsBridges.set(d.id, bridge);
          });
        } else {
          broadcast({
            type: "meta",
            payload: {
              source: "devtools",
              status: "closed",
              level: "warning",
              message:
                "DevTools auto-discovery found no /json targets (falling back to Metro-only mode). Make sure your React Native app is running with debugging enabled.",
              ts: new Date().toISOString(),
            },
          });
        }
      }
    } catch (err) {
      console.error("[rn-inspector] Failed to attach DevTools bridge(s):", err);
    }
  };

  uiWss.on("connection", (client) => {
    if (currentDevices.length) {
      try {
        client.send(
          JSON.stringify({
            type: "meta",
            payload: {
              kind: "devices",
              devices: currentDevices,
              ts: new Date().toISOString(),
            },
          }),
        );
      } catch {}
    }

    client.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "control" && msg.command === "reconnect-devtools") {
          void attachDevtools();
        } else if (msg.type === "control" && msg.command === "fetch-storage") {
          const requestId = msg.requestId || `storage-${Date.now()}`;
          const targetDeviceId = msg.deviceId;

          if (targetDeviceId && targetDeviceId !== "all") {
            const bridge = devtoolsBridges.get(targetDeviceId);
            if (bridge) {
              bridge.requestStorage(requestId);
            } else {
              broadcast({
                type: "storage",
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
                type: "storage",
                payload: {
                  requestId,
                  asyncStorage: { error: "No devices connected" },
                  redux: { error: "No devices connected" },
                  deviceId: "all",
                  ts: new Date().toISOString(),
                },
              });
            } else {
              devtoolsBridges.forEach((bridge) => {
                bridge.requestStorage(`${requestId}-${bridge.deviceId}`);
              });
            }
          }
        } else if (msg.type === "control" && msg.command === "fetch-ui") {
          const requestId = msg.requestId || `ui-${Date.now()}`;
          const targetDeviceId = msg.deviceId;

          if (targetDeviceId && targetDeviceId !== "all") {
            const bridge = devtoolsBridges.get(targetDeviceId);
            if (bridge) {
              bridge.requestUI(requestId);
            } else {
              broadcast({
                type: "inspector",
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
                type: "inspector",
                payload: {
                  requestId,
                  hierarchy: null,
                  screenshot: null,
                  error: "No devices connected",
                  deviceId: "all",
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
      } catch {}
    });
  });

  await attachDevtools();

  metroWs.on("message", (data: RawData) => {
    const raw = data.toString();
    const evt = {
      type: "console",
      payload: {
        ts: new Date().toISOString(),
        level: "info",
        msg: raw,
        origin: "metro",
      },
    };
    broadcast(evt);
  });

  metroWs.on("close", () => {
    console.warn("[rn-inspector] Metro websocket closed");
    try {
      broadcast({
        type: "meta",
        payload: {
          source: "metro",
          status: "closed",
          level: "error",
          message:
            "Metro websocket closed. Is the Metro bundler still running?",
          ts: new Date().toISOString(),
        },
      });
    } catch {}
  });

  metroWs.on("error", (err: Error) => {
    console.error("[rn-inspector] Metro websocket error:", err);
    try {
      broadcast({
        type: "meta",
        payload: {
          source: "metro",
          status: "error",
          level: "error",
          message: "Metro websocket error. Check Metro bundler status.",
          ts: new Date().toISOString(),
        },
      });
    } catch {}
  });

  const server = http.createServer(
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, uiWs: `ws://${host}:${uiPort}/inspector` }),
      );
    },
  );

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log("[rn-inspector] Local proxy health endpoint on", address);

  return { metroWs, uiWss, server, devtoolsBridges };
}

function startStaticUi(staticPort: number) {
  const staticDir = path.resolve(baseDir, "../../ui");
  const serve = serveStatic(staticDir);
  const server = http.createServer((req, res) => {
    const done = finalhandler(req as any, res as any);

    serve(req as any, res as any, (err) => {
      if (err) {
        return done(err as any);
      }
      if (req.method === "GET") {
        const accept = req.headers.accept;
        const acceptsHtml =
          typeof accept === "string" && accept.includes("text/html");

        if (acceptsHtml) {
          const indexPath = path.join(staticDir, "index.html");
          fs.readFile(indexPath, (readErr, data) => {
            if (readErr) {
              return done(readErr as any);
            }
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
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
    if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", '""', url], {
        stdio: "ignore",
        detached: true,
      });
      child.unref();
    } else if (platform === "darwin") {
      const child = spawn("open", [url], { stdio: "ignore", detached: true });
      child.unref();
    } else {
      const child = spawn("xdg-open", [url], {
        stdio: "ignore",
        detached: true,
      });
      child.unref();
    }
  } catch (err) {
    console.error("[rn-inspector] Failed to open browser:", err);
  }
}

function registerKeyHandlers(uiUrl: string) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return;
  }

  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    console.log(
      "[rn-inspector] Keyboard shortcuts: 'o' = open UI, 'r' = show reload hint, Ctrl+C = quit",
    );

    process.stdin.on("data", (chunk: string) => {
      const key = chunk.toString();

      if (key === "o" || key === "O") {
        console.log("[rn-inspector] Opening UI in browser...");
        openInBrowser(uiUrl);
      } else if (key === "r" || key === "R") {
        console.log(
          "[rn-inspector] Reload requested. To fully reload the CLI, press Ctrl+C to stop it and then run `rn-inspector` again.",
        );
      } else if (key === "\u0003") {
        process.exit(0);
      }
    });
  } catch (err) {
    console.error("[rn-inspector] Failed to register key handlers:", err);
  }
}

export async function main() {
  const {
    metroPort,
    uiPort,
    uiWsPort,
    devtoolsWsUrl: explicitDevtoolsWsUrl,
    showVersion,
  } = parseArgs();

  if (showVersion) {
    const version = getCliVersion();
    console.log(chalk.cyan(version));
    return;
  }

  const devtoolsWsUrl = explicitDevtoolsWsUrl;

  console.log(
    chalk.magenta(
      `[rn-inspector] starting proxy (Metro ${metroPort}, UI WS ${uiWsPort ?? DEFAULT_UI_WS_PORT})`,
    ),
  );
  if (devtoolsWsUrl) {
    console.log(
      chalk.blue(`[rn-inspector] DevTools endpoint: ${devtoolsWsUrl}`),
    );
  }
  await startProxy({ metroPort, uiWsPort, devtoolsWsUrl });

  console.log(chalk.blue("[rn-inspector] serving UI assets..."));
  startStaticUi(uiPort);

  const uiUrl = `http://localhost:${uiPort}`;
  console.log(
    chalk.green(
      `[rn-inspector] open ${uiUrl} (UI connects to ws://localhost:${uiWsPort ?? DEFAULT_UI_WS_PORT}/inspector)`,
    ),
  );

  registerKeyHandlers(uiUrl);
}

main().catch((err) => {
  console.error(chalk.red("[rn-inspector] CLI failed:"), err);
  process.exit(1);
});
