import { useEffect, useMemo, useRef, useState } from "react";

export type ConsoleEvent = {
  ts: string;
  level: "log" | "info" | "warn" | "error";
  msg: string;
  origin?: string;
  deviceId?: string;
  rawArgs?: unknown[];
  rawCdpArgs?: unknown[];
};

export type NetworkHeaders = Record<string, string>;

export type NetworkResourceType =
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

export type NetworkEvent = {
  id?: string;
  phase?: "start" | "response" | "end" | "error";
  ts: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  error?: string;
  requestHeaders?: NetworkHeaders;
  responseHeaders?: NetworkHeaders;
  requestBody?: unknown;
  responseBody?: unknown;
  deviceId?: string;
  source?:
    | "fetch"
    | "xhr"
    | "native"
    | "image-prefetch"
    | "image-getsize"
    | "websocket"
    | string;
  resourceType?: NetworkResourceType;
};

export type DeviceInfo = {
  id: string;
  label: string;
  url?: string;
};

export type StorageEvent = {
  requestId: string;
  asyncStorage: Record<string, unknown> | null;
  redux: Record<string, unknown> | null;
  error?: string;
  deviceId?: string;
  ts: string;
};

export type UINode = {
  type: string | null;
  props: Record<string, unknown>;
  children: UINode[];
  key?: string | null;
  error?: string;
  note?: string;
};

export type InspectorEvent = {
  requestId: string;
  hierarchy: UINode | null;
  screenshot: string | null;
  error?: string;
  deviceId?: string;
  ts: string;
};

export type MirrorEvent = {
  deviceId: string;
  frame: string | null;
  error?: string;
  ts: string;
};

export type ProxyEvent =
  | { type: "console"; payload: ConsoleEvent }
  | { type: "network"; payload: NetworkEvent }
  | { type: "storage"; payload: StorageEvent }
  | { type: "inspector"; payload: InspectorEvent }
  | { type: "mirror"; payload: MirrorEvent }
  | { type: "meta"; payload: Record<string, unknown> };

export type StorageMutationPayload = {
  target: "asyncStorage" | "redux";
  op: "set" | "delete";
  path: string;
  value?: unknown;
  deviceId?: string;
};

export function useProxyStream(endpoint?: string) {
  const url = endpoint || "ws://localhost:9230/inspector";
  const wsRef = useRef<WebSocket | null>(null);
  const [consoleEvents, setConsoleEvents] = useState<ConsoleEvent[]>([]);
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([]);
  const [storageData, setStorageData] = useState<Map<string, StorageEvent>>(
    new Map(),
  );
  const [inspectorData, setInspectorData] = useState<
    Map<string, InspectorEvent>
  >(new Map());
  const [mirrorData, setMirrorData] = useState<Map<string, MirrorEvent>>(
    new Map(),
  );
  const [status, setStatus] = useState<
    "connecting" | "open" | "closed" | "error"
  >("connecting");

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("rn_inspector_active_device");
        if (saved && saved !== "all") return saved as string;
      } catch {
        // ignore storage errors
      }
    }
    return "";
  });

  const [devtoolsStatus, setDevtoolsStatus] = useState<
    "unknown" | "open" | "closed" | "error"
  >("unknown");

  const handleProxyEvent = (parsed: ProxyEvent) => {
    if (parsed.type === "console") {
      setConsoleEvents((prev) => [...prev, parsed.payload].slice(-500));
    } else if (parsed.type === "network") {
      setNetworkEvents((prev) => [...prev, parsed.payload].slice(-500));
    } else if (parsed.type === "storage") {
      const storagePayload = parsed.payload as StorageEvent;
      const deviceId = storagePayload.deviceId || "unknown";
      setStorageData((prev) => {
        const next = new Map(prev);
        next.set(deviceId, storagePayload);
        return next;
      });
      if (
        typeof storagePayload.requestId === "string" &&
        storagePayload.requestId.startsWith("storage-mutate")
      ) {
        const asyncError =
          storagePayload.asyncStorage &&
          typeof storagePayload.asyncStorage === "object" &&
          "error" in storagePayload.asyncStorage
            ? (storagePayload.asyncStorage as any).error
            : null;
        const reduxError =
          storagePayload.redux &&
          typeof storagePayload.redux === "object" &&
          "error" in storagePayload.redux
            ? (storagePayload.redux as any).error
            : null;
        if (
          typeof window !== "undefined" &&
          typeof window.showNotification === "function"
        ) {
          if (asyncError || reduxError) {
            const message =
              asyncError || reduxError || "Storage mutation failed.";
            window.showNotification(message, "error");
          } else {
            window.showNotification("Storage updated successfully.", "success");
          }
        }
      }
    } else if (parsed.type === "inspector") {
      const inspectorPayload = parsed.payload as InspectorEvent;
      const deviceId = inspectorPayload.deviceId || "unknown";
      setInspectorData((prev) => {
        const next = new Map(prev);
        next.set(deviceId, inspectorPayload);
        return next;
      });
    } else if (parsed.type === "mirror") {
      const mirrorPayload = parsed.payload as MirrorEvent;
      const deviceId = mirrorPayload.deviceId || "unknown";
      setMirrorData((prev) => {
        const next = new Map(prev);
        next.set(deviceId, mirrorPayload);
        return next;
      });
    } else if (parsed.type === "meta") {
      const payload = parsed.payload as any;
      const kind = payload?.kind;

      if (kind === "devices" && Array.isArray(payload.devices)) {
        const mapped: DeviceInfo[] = payload.devices
          .map((d: any) => {
            if (!d) return null;
            const id = typeof d.id !== "undefined" ? String(d.id) : "";
            if (!id) return null;
            const label =
              typeof d.label === "string" && d.label.length > 0 ? d.label : id;
            const url = typeof d.url === "string" ? d.url : undefined;
            return { id, label, url } as DeviceInfo;
          })
          .filter((d: DeviceInfo | null): d is DeviceInfo => d != null);

        setDevices(mapped);
        if (mapped.length > 0) {
          setActiveDeviceId((prev) => {
            if (prev && mapped.some((d) => d.id === prev)) {
              return prev;
            }
            return mapped[0]?.id ?? "";
          });
        } else {
          setActiveDeviceId("");
        }
      } else {
        const source = payload?.source;
        const statusValue = payload?.status;
        if (source === "devtools" && typeof statusValue === "string") {
          if (
            statusValue === "open" ||
            statusValue === "closed" ||
            statusValue === "error"
          ) {
            setDevtoolsStatus(statusValue);
          }
        }
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : "Proxy status changed.";
        const level = (payload?.level as any) ?? "info";
        if (
          typeof window !== "undefined" &&
          typeof window.showNotification === "function"
        ) {
          window.showNotification(message, level);
        }
      }
    }
  };

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setStatus("open");
      });

      ws.addEventListener("message", (event) => {
        try {
          const parsed: ProxyEvent = JSON.parse(event.data);
          handleProxyEvent(parsed);
        } catch (err) {
          console.warn("[ui] failed to parse proxy message", err);
        }
      });

      ws.addEventListener("close", () => {
        if (stopped) return;
        setStatus("closed");
        if (
          typeof window !== "undefined" &&
          typeof window.showNotification === "function"
        ) {
          window.showNotification(
            "Proxy websocket closed. Click the WS chip to try reconnecting.",
            "warning" as any,
          );
        }
      });
      ws.addEventListener("error", () => {
        if (stopped) return;
        setStatus("error");
        if (
          typeof window !== "undefined" &&
          typeof window.showNotification === "function"
        ) {
          window.showNotification(
            "Proxy websocket error. Check the CLI status.",
            "error" as any,
          );
        }
        ws.close();
      });
    };

    connect();

    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, [url]);

  useEffect(() => {
    if (typeof window !== "undefined" && activeDeviceId) {
      try {
        window.localStorage.setItem(
          "rn_inspector_active_device",
          activeDeviceId,
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [activeDeviceId]);

  const stats = useMemo(
    () => ({
      consoleCount: consoleEvents.length,
      networkCount: networkEvents.length,
      status,
    }),
    [consoleEvents.length, networkEvents.length, status],
  );

  const reconnect = () => {
    setStatus("connecting");
    wsRef.current?.close();
    // Manual reconnect: create a fresh websocket and attach the same handlers.
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.addEventListener("open", () => setStatus("open"));
    ws.addEventListener("message", (event) => {
      try {
        const parsed: ProxyEvent = JSON.parse(event.data);
        handleProxyEvent(parsed);
      } catch (err) {
        console.warn("[ui] failed to parse proxy message", err);
      }
    });
    ws.addEventListener("close", () => {
      setStatus("closed");
    });
    ws.addEventListener("error", () => {
      setStatus("error");
      if (
        typeof window !== "undefined" &&
        typeof window.showNotification === "function"
      ) {
        window.showNotification(
          "Proxy websocket error. Check the CLI status.",
          "error" as any,
        );
      }
      ws.close();
    });
  };

  const reconnectDevtools = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "reconnect-devtools",
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const mutateStorage = (payload: StorageMutationPayload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "mutate-storage",
          deviceId: payload.deviceId || activeDeviceId,
          requestId: `storage-mutate-${Date.now()}`,
          target: payload.target,
          op: payload.op,
          path: payload.path,
          value: payload.value,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const fetchStorage = (deviceId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "fetch-storage",
          deviceId: deviceId || activeDeviceId,
          requestId: `storage-${Date.now()}`,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const fetchUI = (deviceId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "fetch-ui",
          deviceId: deviceId || activeDeviceId,
          requestId: `ui-${Date.now()}`,
        }),
      );
    } catch {
      // ignore send errors
    }
  };

  const startMirror = (
    platform?: "android" | "ios" | "ios-sim" | "ios-device",
    deviceId?: string,
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "start-mirror",
          deviceId: deviceId || activeDeviceId,
          platform,
        }),
      );
    } catch {
      // ignore
    }
  };

  const stopMirror = (deviceId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(
        JSON.stringify({
          type: "control",
          command: "stop-mirror",
          deviceId: deviceId || activeDeviceId,
        }),
      );
    } catch {
      // ignore
    }
  };

  return {
    consoleEvents,
    networkEvents,
    storageData,
    inspectorData,
    mirrorData,
    status,
    stats,
    reconnect,
    devices,
    activeDeviceId,
    setActiveDeviceId,
    devtoolsStatus,
    reconnectDevtools,
    fetchStorage,
    fetchUI,
    startMirror,
    stopMirror,
    mutateStorage,
  };
}
