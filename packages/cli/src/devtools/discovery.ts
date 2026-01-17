import http from 'http';
import chalk from 'chalk';
import {
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_HOST,
  DEVTOOLS_DISCOVERY_PATH,
  DEVTOOLS_EXTRA_PORTS,
  DEVTOOLS_PORT_OFFSETS,
} from '../config/Index';
import type { DevtoolsTarget } from '../types/Index';

function httpGetJson(host: string, port: number, path: string): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path,
        timeout: DEFAULT_DISCOVERY_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(undefined);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(text);
            resolve(json);
          } catch {
            resolve(undefined);
          }
        });
      },
    );

    req.on('error', () => {
      resolve(undefined);
    });

    req.on('timeout', () => {
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
      const deviceParam = urlObj.searchParams.get('device');
      const pageParam = urlObj.searchParams.get('page');
      if (deviceParam) deviceKey = deviceParam;
      if (pageParam) {
        const parsed = Number(pageParam);
        if (!Number.isNaN(parsed)) page = parsed;
      }
    } catch {
      // ignore URL parse errors, fall back to id
    }

    if (!deviceKey) deviceKey = t.title || t.description || t.webSocketDebuggerUrl;

    if (!deviceKey) return;

    const existing = map.get(deviceKey);
    const existingPage = existing
      ? (() => {
          try {
            const p = new URL(existing.webSocketDebuggerUrl).searchParams.get('page');
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

export async function discoverDevtoolsTargets(metroPort: number): Promise<DevtoolsTarget[]> {
  const host = DEFAULT_HOST;
  const candidates = new Set<number>();
  candidates.add(metroPort);
  DEVTOOLS_PORT_OFFSETS.forEach((delta) => candidates.add(metroPort + delta));
  DEVTOOLS_EXTRA_PORTS.forEach((p) => candidates.add(p));

  const results: DevtoolsTarget[] = [];
  const seenUrls = new Set<string>();

  for (const port of candidates) {
    const json = await httpGetJson(host, port, DEVTOOLS_DISCOVERY_PATH);
    if (!json) continue;

    const tryList = Array.isArray(json)
      ? json
      : Array.isArray((json as any).targets)
      ? (json as any).targets
      : [];

    let index = 0;
    for (const item of tryList) {
      if (item && typeof (item as any).webSocketDebuggerUrl === 'string') {
        const url = String((item as any).webSocketDebuggerUrl);

        if (seenUrls.has(url)) {
          index += 1;
          continue;
        }

        seenUrls.add(url);
        const id = String((item as any).id ?? `${port}-${index}`);
        const title = typeof (item as any).title === 'string' ? (item as any).title : undefined;
        const description =
          typeof (item as any).description === 'string' ? (item as any).description : undefined;
        results.push({ id, title, description, webSocketDebuggerUrl: url });
        index += 1;
      }
    }
  }

  const deduped = dedupeDevtoolsTargets(results);

  if (deduped.length === 0) {
    console.log(
      chalk.yellow('[rn-inspector] DevTools auto-discovery found no /json targets (falling back to Metro-only mode)'),
    );
  } else {
    if (deduped.length < results.length) {
      console.log(
        chalk.yellow(
          `[rn-inspector] Deduped DevTools targets (kept ${deduped.length} of ${results.length}) — likely duplicate entries for the same device`,
        ),
      );
    }
    console.log(chalk.green('[rn-inspector] Discovered DevTools targets:'));
    deduped.forEach((t, idx) => {
      const label = t.title || t.description || t.id;
      console.log(chalk.cyan(`  [${idx}] ${t.webSocketDebuggerUrl} (${label})`));
    });
  }

  return deduped;
}
