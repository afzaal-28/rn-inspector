import WebSocket from "ws";
import chalk from "chalk";
import { INJECT_NETWORK_SNIPPET } from "../snippets/INJECT_NETWORK_SNIPPET";
import { INJECT_STORAGE_SNIPPET } from "../snippets/INJECT_STORAGE_SNIPPET";
import type { DevtoolsBridge, DevtoolsState } from "../types/Index";
import {
  handleInjectedNetworkFromConsole,
  handleInjectedStorageFromConsole,
  handleLogEntry,
  handleNetworkEvent,
  handleRuntimeConsole,
  normalizeConsoleArg,
} from "./handlers";

export function attachDevtoolsBridge(
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
  const pendingNetworkBodyRequests = new Map<number, (value: unknown) => void>();

  const evaluateConsoleArg = async (arg: any): Promise<unknown> => {
    if (!arg || typeof arg !== "object" || !arg.objectId) {
      return normalizeConsoleArg(arg);
    }

    const ws = devtoolsWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return normalizeConsoleArg(arg);
    }

    return await getDeepObjectProperties(ws, arg.objectId, 0);
  };

  const getDeepObjectProperties = async (
    ws: WebSocket,
    objectId: string,
    depth: number,
  ): Promise<unknown> => {
    const MAX_DEPTH = 20;
    const MAX_PROPERTIES = 500;

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

      for (
        let i = 0;
        i < Math.min(result.result.length, MAX_PROPERTIES);
        i += 1
      ) {
        const prop = result.result[i];
        if (!prop || !prop.name) continue;

        const name = String(prop.name);
        if (processed.has(name)) continue;
        processed.add(name);

        try {
          if (prop.value) {
            const value = prop.value;

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
              if (value.subtype === "array") {
                if (value.objectId && depth < MAX_DEPTH - 1) {
                  const arrayProps = await getDeepObjectProperties(
                    ws,
                    value.objectId,
                    depth + 1,
                  );
                  if (typeof arrayProps === "object" && arrayProps !== null) {
                    const propsObj = arrayProps as Record<string, unknown>;

                    const arrayLength = (propsObj["length"] as number) || 0;

                    const resultArray: unknown[] = [];

                    for (let j = 0; j < arrayLength; j += 1) {
                      const key = String(j);
                      if (propsObj[key] !== undefined) {
                        resultArray.push(propsObj[key]);
                      }
                    }

                    properties[name] = resultArray;
                  } else {
                    properties[name] = [];
                  }
                } else {
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
              } else if (value.objectId && depth < MAX_DEPTH - 1) {
                properties[name] = await getDeepObjectProperties(
                  ws,
                  value.objectId,
                  depth + 1,
                );
              } else {
                properties[name] = value.preview
                  ? {
                      __type: value.className || "Object",
                      __preview: value.preview.description || value.description,
                      __overflow: value.preview.overflow,
                    }
                  : { __type: value.className || "Object" };
              }
            } else {
              properties[name] =
                value.description || value.unserializableValue || "[Unknown]";
            }
          } else if (prop.get || prop.set) {
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
        chalk.green(
          `[rn-inspector] Connected to DevTools websocket: ${devtoolsWsUrl}`,
        ),
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
        const injections = [
          {
            id: 6,
            method: "Runtime.evaluate",
            params: {
              expression: INJECT_STORAGE_SNIPPET,
              includeCommandLineAPI: false,
              awaitPromise: false,
            },
          },
          {
            id: 7,
            method: "Runtime.evaluate",
            params: {
              expression: INJECT_NETWORK_SNIPPET,
              includeCommandLineAPI: false,
              awaitPromise: false,
            },
          },
        ];
        injections.forEach((injection) => {
          ws.send(JSON.stringify(injection));
        });
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

    ws.on("message", async (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (!parsed || typeof parsed !== "object") return;

        if (typeof parsed.id === "number") {
          const resolver = pendingConsoleEvals.get(parsed.id);
          if (resolver) {
            pendingConsoleEvals.delete(parsed.id);
            let value: unknown = null;
            if (parsed.result) {
              if (Array.isArray(parsed.result)) {
                value = parsed.result;
              } else if (typeof parsed.result.value !== "undefined") {
                value = parsed.result.value;
              } else {
                value = parsed.result;
              }
            }
            resolver(value);
          }
          
          const networkBodyResolver = pendingNetworkBodyRequests.get(parsed.id);
          if (networkBodyResolver) {
            pendingNetworkBodyRequests.delete(parsed.id);
            networkBodyResolver(parsed.result || null);
          }
          return;
        }

        const method =
          typeof parsed.method === "string" ? parsed.method : undefined;
        const params = parsed.params as any;
        if (!method) return;

        if (method === "Runtime.consoleAPICalled") {
          if (
            handleInjectedNetworkFromConsole(params, state, broadcast, deviceId)
          )
            return;
          if (handleInjectedStorageFromConsole(params, broadcast, deviceId))
            return;
          await handleRuntimeConsole(
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
          handleNetworkEvent(method, params, state, broadcast, ws, pendingNetworkBodyRequests, deviceId);
        }
      } catch {}
    });

    ws.on("close", () => {
      console.warn(chalk.yellow("[rn-inspector] DevTools websocket closed"));
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

  const requestStorageMutation = (payload: {
    requestId: string;
    target: "asyncStorage" | "redux";
    op: "set" | "delete";
    path: string;
    value?: unknown;
  }) => {
    if (!devtoolsWs || devtoolsWs.readyState !== WebSocket.OPEN) {
      broadcast({
        type: "storage",
        payload: {
          requestId: payload.requestId,
          asyncStorage: { error: "DevTools not connected" },
          redux: { error: "DevTools not connected" },
          deviceId,
          ts: new Date().toISOString(),
        },
      });
      return;
    }

    const evalId = nextStorageRequestId++;
    const encoded = JSON.stringify(payload)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`");
    devtoolsWs.send(
      JSON.stringify({
        id: evalId,
        method: "Runtime.evaluate",
        params: {
          expression:
            `(typeof __RN_INSPECTOR_MUTATE_STORAGE__ === 'function')` +
            ` ? __RN_INSPECTOR_MUTATE_STORAGE__(JSON.parse(\`${encoded}\`))` +
            ` : console.log('__RN_INSPECTOR_STORAGE__:' + JSON.stringify({ requestId: '${payload.requestId}', asyncStorage: { error: 'Storage mutation helper not injected' }, redux: { error: 'Storage mutation helper not injected' } }))`,
          includeCommandLineAPI: false,
          awaitPromise: false,
        },
      }),
    );
  };

  return { ws, deviceId, requestStorage, requestStorageMutation };
}
