import path from 'path';
import fs from 'fs';

export const DEFAULT_METRO_PORT = 8081;
export const DEFAULT_UI_WS_PORT = 9230;
export const DEFAULT_UI_STATIC_PORT = 4173;

const baseFile: string = typeof __filename !== 'undefined' ? __filename : path.resolve(process.argv[1] ?? '');
export const baseDir: string = typeof __dirname !== 'undefined' ? __dirname : path.dirname(baseFile);

export function getCliVersion(): string {
  try {
    const pkgPath = path.resolve(baseDir, '../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getMetroPort(envPort?: string | undefined): number {
  if (envPort) {
    const parsed = Number(envPort);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
    console.warn(`[rn-inspector] Ignoring invalid METRO_PORT="${envPort}", falling back to ${DEFAULT_METRO_PORT}`);
  }
  return DEFAULT_METRO_PORT;
}
