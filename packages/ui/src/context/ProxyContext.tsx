import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useProxyStream,
  type ConsoleEvent,
  type NetworkEvent,
  type DeviceInfo,
  type StorageEvent,
  type StorageMutationPayload,
  type NavigationState,
  type NavigationHistoryEntry,
} from "../hooks/useProxyStream";

export interface ProxyContextValue {
  consoleEvents: ConsoleEvent[];
  networkEvents: NetworkEvent[];
  storageData: Map<string, StorageEvent>;
  navigationState: NavigationState | null;
  navigationHistory: NavigationHistoryEntry[];
  availableRoutes: string[];
  status: "connecting" | "open" | "closed" | "error";
  stats: { consoleCount: number; networkCount: number; status: typeof status };
  reconnect: () => void;
  devices: DeviceInfo[];
  activeDeviceId: string;
  setActiveDeviceId: (id: string) => void;
  devtoolsStatus: "unknown" | "open" | "closed" | "error";
  reconnectDevtools: () => void;
  fetchStorage: (deviceId?: string) => void;
  mutateStorage: (payload: StorageMutationPayload) => void;
  navigateToRoute: (
    routeName: string,
    params?: Record<string, unknown>,
    deviceId?: string,
  ) => void;
  goBack: (deviceId?: string) => void;
  resetNavigation: (state: unknown, deviceId?: string) => void;
  openUrl: (url: string, deviceId?: string) => void;
  getNavigationState: (deviceId?: string) => void;
  consoleClearedAtMs: number | null;
  setConsoleClearedAtMs: (value: number | null) => void;
  networkClearedAtMs: number | null;
  setNetworkClearedAtMs: (value: number | null) => void;
  captureConsole: boolean;
  setCaptureConsole: (value: boolean) => void;
  captureNetwork: boolean;
  setCaptureNetwork: (value: boolean) => void;
}

const ProxyContext = createContext<ProxyContextValue | undefined>(undefined);

interface ProxyProviderProps {
  children: ReactNode;
}

export const ProxyProvider = ({ children }: ProxyProviderProps) => {
  const stream = useProxyStream();

  const [captureConsole, setCaptureConsole] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(
          "rn_inspector_capture_console",
        );
        if (saved === "true" || saved === "false") return saved === "true";
      } catch {
        // ignore storage errors
      }
    }
    return true;
  });

  const [consoleClearedAtMs, setConsoleClearedAtMs] = useState<number | null>(
    null,
  );
  const [networkClearedAtMs, setNetworkClearedAtMs] = useState<number | null>(
    null,
  );

  const [captureNetwork, setCaptureNetwork] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(
          "rn_inspector_capture_network",
        );
        if (saved === "true" || saved === "false") return saved === "true";
      } catch {
        // ignore storage errors
      }
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          "rn_inspector_capture_console",
          String(captureConsole),
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [captureConsole]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          "rn_inspector_capture_network",
          String(captureNetwork),
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [captureNetwork]);

  const consoleEvents: ConsoleEvent[] = useMemo(
    () => (captureConsole ? stream.consoleEvents : []),
    [captureConsole, stream.consoleEvents],
  );

  const networkEvents: NetworkEvent[] = useMemo(
    () => (captureNetwork ? stream.networkEvents : []),
    [captureNetwork, stream.networkEvents],
  );

  const value: ProxyContextValue = {
    consoleEvents,
    networkEvents,
    storageData: stream.storageData,
    navigationState: stream.navigationState,
    navigationHistory: stream.navigationHistory,
    availableRoutes: stream.availableRoutes,
    status: stream.status,
    stats: stream.stats as any,
    reconnect: stream.reconnect,
    devices: stream.devices,
    activeDeviceId: stream.activeDeviceId,
    setActiveDeviceId: stream.setActiveDeviceId,
    devtoolsStatus: stream.devtoolsStatus,
    reconnectDevtools: stream.reconnectDevtools,
    fetchStorage: stream.fetchStorage,
    mutateStorage: stream.mutateStorage,
    navigateToRoute: stream.navigateToRoute,
    goBack: stream.goBack,
    resetNavigation: stream.resetNavigation,
    openUrl: stream.openUrl,
    getNavigationState: stream.getNavigationState,
    consoleClearedAtMs,
    setConsoleClearedAtMs,
    networkClearedAtMs,
    setNetworkClearedAtMs,
    captureConsole,
    setCaptureConsole,
    captureNetwork,
    setCaptureNetwork,
  };

  return (
    <ProxyContext.Provider value={value}>{children}</ProxyContext.Provider>
  );
};

export const useProxy = () => {
  const ctx = useContext(ProxyContext);
  if (!ctx) {
    throw new Error("useProxy must be used within a ProxyProvider");
  }
  return ctx;
};
