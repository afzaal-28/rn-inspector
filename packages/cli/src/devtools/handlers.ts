import type WebSocket from "ws";
import type {
  DevtoolsState,
  NetworkResourceType,
  TrackedRequest,
} from "../types/Index";

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function mapConsoleLevel(
  type: string | undefined,
): "log" | "info" | "warn" | "error" {
  if (type === "error") return "error";
  if (type === "warning" || type === "warn") return "warn";
  if (type === "info") return "info";
  return "log";
}

export function handleInjectedDeviceInfoFromConsole(
  params: any,
  broadcast: (message: unknown) => void,
  deviceId?: string,
): boolean {
  if (!params || !Array.isArray(params.args) || params.args.length === 0)
    return false;
  const first = params.args[0];
  const raw = typeof first.value === "string" ? first.value : undefined;
  if (!raw || !raw.startsWith("__RN_INSPECTOR_DEVICE_INFO__")) return false;

  const rest = raw.slice("__RN_INSPECTOR_DEVICE_INFO__".length);
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
    type: "deviceInfo",
    payload: {
      ...payload,
      deviceId,
    },
  });

  return true;
}

export function handleInjectedStorageFromConsole(
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

export function handleInjectedNetworkFromConsole(
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

  if (phase === "complete") {
    // Complete phase contains all data in one event
    const ts = typeof payload.ts === "string" ? payload.ts : new Date().toISOString();
    broadcast({
      type: "network",
      payload: {
        id,
        phase: "complete",
        ts,
        method: String(payload.method || "GET"),
        url: String(payload.url || ""),
        status: typeof payload.status === "number" ? payload.status : undefined,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
        error: typeof payload.error === "string" ? payload.error : undefined,
        requestHeaders: payload.requestHeaders as Record<string, string> | undefined,
        responseHeaders: payload.responseHeaders as Record<string, string> | undefined,
        requestBody: payload.requestBody,
        responseBody: payload.responseBody,
        deviceId,
        source: typeof payload.source === "string" ? payload.source : undefined,
        resourceType: typeof payload.resourceType === "string" ? (payload.resourceType as NetworkResourceType) : undefined,
      },
    });
    return true;
  } else if (phase === "start") {
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
        status: req.status,
        durationMs: req.durationMs,
        error: req.error,
        requestHeaders: req.requestHeaders,
        responseHeaders: req.responseHeaders,
        requestBody: req.requestBody,
        responseBody: req.responseBody,
        deviceId,
        source: req.source,
        resourceType: req.resourceType,
      },
    });
  } else if (phase === "response") {
    const existing = map.get(id);
    if (!existing) return true;
    existing.status =
      typeof payload.status === "number" ? payload.status : existing.status;
    existing.responseHeaders = payload.responseHeaders as
      | Record<string, string>
      | undefined;
    existing.responseBody = payload.responseBody;
    existing.durationMs =
      typeof payload.durationMs === "number"
        ? payload.durationMs
        : existing.durationMs;
    const ts =
      typeof payload.ts === "string"
        ? payload.ts
        : new Date(existing.startTimeMs).toISOString();
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
  } else if (phase === "end" || phase === "error") {
    const existing = map.get(id);
    if (!existing) return true;
    existing.durationMs =
      typeof payload.durationMs === "number"
        ? payload.durationMs
        : existing.durationMs;
    existing.status =
      typeof payload.status === "number" ? payload.status : existing.status;
    existing.error =
      typeof payload.error === "string" ? payload.error : existing.error;
    const ts =
      typeof payload.ts === "string"
        ? payload.ts
        : new Date(existing.startTimeMs).toISOString();
    broadcast({
      type: "network",
      payload: {
        id,
        phase: payload.phase,
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
    map.delete(id);
  }

  return true;
}

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

function detectResourceTypeFromCDP(
  url: string,
  contentType: string | undefined,
  cdpResourceType: string | undefined,
): NetworkResourceType {
  const urlLower = (url || "").toLowerCase();
  const ctLower = (contentType || "").toLowerCase();
  const cdpType = (cdpResourceType || "").toLowerCase();

  if (cdpType === "websocket") return "socket";
  if (cdpType === "image") return "img";
  if (cdpType === "font") return "font";
  if (cdpType === "stylesheet") return "css";
  if (cdpType === "script") return "js";
  if (cdpType === "media") return "media";
  if (cdpType === "document") return "doc";
  if (cdpType === "xhr") return "xhr";
  if (cdpType === "fetch") return "fetch";

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

export async function handleNetworkEvent(
  method: string,
  params: any,
  state: DevtoolsState,
  broadcast: (message: unknown) => void,
  ws: WebSocket | null,
  pendingNetworkBodyRequests: Map<number, (value: unknown) => void>,
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

    // Fetch response body from CDP if available
    if (method === "Network.loadingFinished" && ws && ws.readyState === 1) {
      try {
        const responseBodyId = Date.now() + Math.floor(Math.random() * 100000);
        const responseBodyPromise = new Promise<any>((resolve) => {
          const timeout = setTimeout(() => {
            pendingNetworkBodyRequests.delete(responseBodyId);
            resolve(null);
          }, 1500);

          pendingNetworkBodyRequests.set(responseBodyId, (value: unknown) => {
            clearTimeout(timeout);
            resolve(value);
          });
        });

        ws.send(
          JSON.stringify({
            id: responseBodyId,
            method: "Network.getResponseBody",
            params: { requestId: id },
          }),
        );

        const result = await responseBodyPromise;
        if (result) {
          if (result.error) {
            // CDP returned an error (e.g., "No resource with given identifier found")
            // This is normal for some requests (redirects, cached, etc.)
          } else if (typeof result.body === "string") {
            if (result.base64Encoded) {
              // Decode base64 data
              try {
                const decoded = Buffer.from(result.body, 'base64').toString('utf-8');
                existing.responseBody = tryParseJson(decoded);
              } catch (err) {
                // If decode fails, it's likely binary data
                existing.responseBody = `[Binary data: ${result.body.length} chars]`;
              }
            } else {
              // For text data, try to parse as JSON
              existing.responseBody = tryParseJson(result.body);
            }
          }
        }
      } catch (err) {
        // Response body fetch failed, continue without it
      }
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

export function stringifyConsoleArgs(args: any[] | undefined): string {
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

export function stringifyConsoleValues(values: unknown[] | undefined): string {
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

export function normalizePreviewProperty(prop: any): unknown {
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

export function normalizeConsoleArg(arg: any): unknown {
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
          if (!Number.isNaN(idx)) {
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

export async function handleRuntimeConsole(
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

export function handleLogEntry(
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
