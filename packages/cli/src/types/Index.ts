import type WebSocket from "ws";

export type ProxyOptions = {
  metroPort?: number;
  host?: string;
  uiWsPort?: number;
  devtoolsWsUrl?: string;
};

export type DevtoolsTarget = {
  id: string;
  title?: string;
  description?: string;
  webSocketDebuggerUrl: string;
};

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

export type TrackedRequest = {
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

export type DevtoolsState = {
  requests: Map<string, TrackedRequest>;
};

export type DevtoolsBridge = {
  ws: WebSocket;
  deviceId: string;
  requestStorage: (requestId: string) => void;
  requestStorageMutation: (payload: {
    requestId: string;
    target: "asyncStorage" | "redux";
    op: "set" | "delete";
    path: string;
    value?: unknown;
  }) => void;
};

export type NavigationRoute = {
  name: string;
  key: string;
  params?: Record<string, unknown>;
  path?: string;
};

export type NavigationState = {
  state?: unknown;
  currentRoute?: NavigationRoute;
};

export type NavigationHistoryEntry = {
  name: string;
  key: string;
  params?: Record<string, unknown>;
  timestamp: string;
};

export type NavigationEvent = {
  type: "navigation";
  payload: {
    type: "installed" | "ref-ready" | "state-change" | "navigate" | "go-back" | "reset" | "open-url";
    state?: NavigationState;
    history?: NavigationHistoryEntry[];
    availableRoutes?: string[];
    routeName?: string;
    params?: Record<string, unknown>;
    url?: string;
  };
  timestamp: string;
  deviceId: string;
};

export type NavigationCommand = {
  command: "navigate" | "go-back" | "reset-navigation" | "open-url" | "get-navigation-state";
  payload?: {
    routeName?: string;
    params?: Record<string, unknown>;
    state?: unknown;
    url?: string;
  };
  deviceId?: string;
  requestId?: string;
};
