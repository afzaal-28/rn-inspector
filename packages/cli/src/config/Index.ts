import path from "path";
import fs from "fs";

export const DEFAULT_METRO_PORT = 8081;
export const DEFAULT_UI_WS_PORT = 9230;
export const DEFAULT_UI_STATIC_PORT = 4173;
export const DEFAULT_HOST = "127.0.0.1";
export const DEVTOOLS_PORT_OFFSETS: number[] = Array.from(
  { length: 10 },
  (_v, i) => i + 1,
);
export const DEVTOOLS_EXTRA_PORTS = [9222, 9229, 9230];
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 750;
export const DEVTOOLS_DISCOVERY_PATH = "/json";
export const METRO_WS_PATH = "/message";
export const UI_WS_PATH = "/inspector";
export const UI_STATIC_INDEX = "index.html";
export const ENV_DEVTOOLS_URL = "RN_INSPECTOR_DEVTOOLS_URL";
export const ENV_METRO_PORT = "METRO_PORT";
export const CONTROL_MSG_TYPE = "control";
export const CONTROL_CMD_RECONNECT = "reconnect-devtools";
export const CONTROL_CMD_FETCH_STORAGE = "fetch-storage";
export const CONTROL_CMD_MUTATE_STORAGE = "mutate-storage";
export const DEVICE_ID_EXPLICIT = "devtools-explicit";
export const DEVICE_ID_ALL = "all";
export const DEVICE_LABEL_EXPLICIT = "DevTools (explicit URL)";
export const META_KIND_DEVICES = "devices";
export const META_MSG_TYPE = "meta";

const baseFile: string =
  typeof __filename !== "undefined"
    ? __filename
    : path.resolve(process.argv[1] ?? "");
export const baseDir: string =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(baseFile);

export function getUiStaticDir(): string {
  return path.resolve(baseDir, "../../ui");
}

export function getCliVersion(): string {
  try {
    const pkgPath = path.resolve(baseDir, "../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function getMetroPort(envPort?: string | undefined): number {
  if (envPort) {
    const parsed = Number(envPort);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
    console.warn(
      `[rn-inspector] Ignoring invalid METRO_PORT="${envPort}", falling back to ${DEFAULT_METRO_PORT}`,
    );
  }
  return DEFAULT_METRO_PORT;
}
