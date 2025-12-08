import WebSocket from 'ws';

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
};

export type DevtoolsState = {
  requests: Map<string, TrackedRequest>;
};

export type DevtoolsBridge = {
  ws: WebSocket;
  deviceId: string;
  requestStorage: (requestId: string) => void;
  requestUI: (requestId: string) => void;
};
