#!/usr/bin/env node
import http, { IncomingMessage, ServerResponse } from "http";
import WebSocket, { RawData, WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import serveStatic from "serve-static";
import finalhandler from "finalhandler";
import chalk from "chalk";
import { spawn } from "child_process";
import { discoverDevtoolsTargets } from "./devtools/discovery";
import { attachDevtoolsBridge } from "./devtools/bridge";
import type { DevtoolsBridge, ProxyOptions } from "./types/Index";
import {
  DEFAULT_HOST,
  DEFAULT_METRO_PORT,
  DEFAULT_UI_WS_PORT,
  DEFAULT_UI_STATIC_PORT,
  ENV_DEVTOOLS_URL,
  ENV_METRO_PORT,
  CONTROL_CMD_FETCH_STORAGE,
  CONTROL_CMD_MUTATE_STORAGE,
  CONTROL_CMD_RECONNECT,
  CONTROL_MSG_TYPE,
  DEVICE_ID_ALL,
  DEVICE_ID_EXPLICIT,
  DEVICE_LABEL_EXPLICIT,
  META_MSG_TYPE,
  META_KIND_DEVICES,
  METRO_WS_PATH,
  UI_STATIC_INDEX,
  UI_WS_PATH,
  baseDir,
  getCliVersion,
  getMetroPort,
  getUiStaticDir,
} from "./config/Index";

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
    devtoolsWsUrl: process.env[ENV_DEVTOOLS_URL],
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
  if (process.env[ENV_METRO_PORT]) {
    const v = Number(process.env[ENV_METRO_PORT]);
    if (!Number.isNaN(v)) parsed.metroPort = v;
  }
  return parsed;
}

async function startProxy(opts: ProxyOptions = {}) {
  const metroPort = opts.metroPort ?? getMetroPort(process.env.METRO_PORT);
  const host = opts.host ?? DEFAULT_HOST;
  const uiPort = opts.uiWsPort ?? DEFAULT_UI_WS_PORT;

  const targetWsUrl = `ws://${host}:${metroPort}${METRO_WS_PATH}`;
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
        `[rn-inspector] UI WebSocket server on ws://${host}:${uiPort}${UI_WS_PATH}`,
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
        const deviceId = DEVICE_ID_EXPLICIT;
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
            label: DEVICE_LABEL_EXPLICIT,
            url: opts.devtoolsWsUrl,
          },
        ];

        broadcast({
          type: "meta",
          payload: {
            kind: META_KIND_DEVICES,
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
            type: META_MSG_TYPE,
            payload: {
              kind: META_KIND_DEVICES,
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
            type: META_MSG_TYPE,
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
            type: META_MSG_TYPE,
            payload: {
              kind: META_KIND_DEVICES,
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
        if (
          msg.type === CONTROL_MSG_TYPE &&
          msg.command === CONTROL_CMD_RECONNECT
        ) {
          void attachDevtools();
        } else if (
          msg.type === CONTROL_MSG_TYPE &&
          msg.command === CONTROL_CMD_FETCH_STORAGE
        ) {
          const requestId = msg.requestId || `storage-${Date.now()}`;
          const targetDeviceId = msg.deviceId;

          if (targetDeviceId && targetDeviceId !== DEVICE_ID_ALL) {
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
                  deviceId: DEVICE_ID_ALL,
                  ts: new Date().toISOString(),
                },
              });
            } else {
              devtoolsBridges.forEach((bridge) => {
                bridge.requestStorage(`${requestId}-${bridge.deviceId}`);
              });
            }
          }
        } else if (
          msg.type === CONTROL_MSG_TYPE &&
          msg.command === CONTROL_CMD_MUTATE_STORAGE
        ) {
          const requestId = msg.requestId || `storage-mutate-${Date.now()}`;
          const targetDeviceId = msg.deviceId;
          const payload = {
            requestId,
            target: msg.target,
            op: msg.op,
            path: msg.path,
            value: msg.value,
          } as {
            requestId: string;
            target: "asyncStorage" | "redux";
            op: "set" | "delete";
            path: string;
            value?: unknown;
          };

          const sendMutation = (bridge: DevtoolsBridge) => {
            bridge.requestStorageMutation(payload);
          };

          if (targetDeviceId && targetDeviceId !== DEVICE_ID_ALL) {
            const bridge = devtoolsBridges.get(targetDeviceId);
            if (bridge) {
              sendMutation(bridge);
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
                  deviceId: DEVICE_ID_ALL,
                  ts: new Date().toISOString(),
                },
              });
            } else {
              devtoolsBridges.forEach((bridge) => {
                sendMutation({ ...bridge, requestId: `${requestId}-${bridge.deviceId}` } as any);
              });
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
        JSON.stringify({
          ok: true,
          uiWs: `ws://${host}:${uiPort}${UI_WS_PATH}`,
        }),
      );
    },
  );

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  console.log("[rn-inspector] Local proxy health endpoint on", address);

  return { metroWs, uiWss, server, devtoolsBridges };
}

function startStaticUi(staticPort: number) {
  const staticDir = getUiStaticDir();
  const serve = serveStatic(staticDir);
  const server = http.createServer((req, res) => {
    if (req.url && req.url.includes("..")) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad Request");
      return;
    }
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
          const indexPath = path.join(staticDir, UI_STATIC_INDEX);
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
      `[rn-inspector] open ${uiUrl} (UI connects to ws://localhost:${uiWsPort ?? DEFAULT_UI_WS_PORT}${UI_WS_PATH})`,
    ),
  );

  registerKeyHandlers(uiUrl);
}

main().catch((err) => {
  console.error(chalk.red("[rn-inspector] CLI failed:"), err);
  process.exit(1);
});
