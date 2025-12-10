# rn-inspector CLI

[![npm version](https://img.shields.io/npm/v/rn-inspector.svg?label=rn-inspector)](https://www.npmjs.com/package/rn-inspector)
[![npm downloads](https://img.shields.io/npm/dm/rn-inspector.svg)](https://www.npmjs.com/package/rn-inspector)

`rn-inspector` is a focused CLI + Web UI that helps you debug **React Native** apps by:

- Proxying **Metro** messages.
- Attaching to **DevTools** targets (single or multiple devices/emulators).
- Streaming **console logs**, **network requests**, and selected **storage state** into a modern, glassy web UI.

This package is the **CLI entry point** you install globally.

---

## Installation

Install globally from npm:

```bash
npm install -g rn-inspector
```

After installing, the `rn-inspector` command is available in your shell.

---

## Quick start

1. Start your React Native app as usual (Metro running, app open in simulator or device).
2. In another terminal, run:

   ```bash
   rn-inspector
   ```

3. By default this will:

   - Connect to **Metro** on port `8081`.
   - Start a **WebSocket proxy** for the UI at `ws://localhost:9230/inspector`.
   - Serve the **UI** at `http://localhost:4173`.
   - Auto-discover any available **DevTools targets** (for connected devices/emulators).

4. Open the UI in your browser (or use the `o` keyboard shortcut), pick a device from the header, and start inspecting **Console** and **Network** events.

---

## CLI usage

```bash
rn-inspector \
  [--port 8081 | --port=8081] \
  [--ui-port 4173 | --ui-port=4173] \
  [--ui-ws-port 9230 | --ui-ws-port=9230] \
  [--devtools-url ws://...] \
  [--version]
```

### Options

- `--port <number>` / `--port=<number>`
  - Metro port to connect to.
  - Default: `8081`.
  - This is also affected by the `METRO_PORT` environment variable (see below).

- `--ui-port <number>` / `--ui-port=<number>`
  - HTTP port where the Web UI is served.
  - Default: `4173`.
  - The UI will be available at `http://localhost:<ui-port>`.

- `--ui-ws-port <number>` / `--ui-ws-port=<number>`
  - WebSocket port used between the CLI proxy and the Web UI.
  - Default: `9230`.
  - The UI connects to `ws://localhost:<ui-ws-port>/inspector`.

- `--devtools-url <ws-url>` / `--devtools-url=<ws-url>`
  - Explicit DevTools websocket URL to attach to (for advanced usage).
  - If omitted, `rn-inspector` will **auto-discover** DevTools targets via `http://<host>:<port>/json` on a range of ports (starting around the Metro port) and attach to all matching targets.

- `--version`
  - Print the `rn-inspector` CLI version and exit.

### Environment variables

- `METRO_PORT`
  - If set, this overrides the default Metro port.
  - Equivalent to passing `--port=<METRO_PORT>`.

- `RN_INSPECTOR_DEVTOOLS_URL`
  - Default DevTools websocket URL if `--devtools-url` is not provided.
  - Example: `ws://localhost:9229/devtools/page/XXXX-YYYY`.

---

## Multi-device DevTools support

`rn-inspector` is designed to work with **multiple React Native targets** at once:

- The CLI scans a set of ports (around the Metro port and some common DevTools ports) for `/json` endpoints.
- For each DevTools target it finds, it:
  - Opens a WebSocket connection.
  - Tags all console and network events with a `deviceId`.
- The CLI periodically sends a **meta `devices` event** over the UI WebSocket with a list of currently attached devices.
- The Web UI:
  - Shows a **global device selector** in the header.
  - Filters **Console** and **Network** events by the selected device while still showing Metro-only events.

If you prefer to control the DevTools connection manually, you can pass a `--devtools-url` instead of relying on auto-discovery.

---

## Web UI overview

When `rn-inspector` is running, the UI is served from:

```text
http://localhost:<ui-port>
```

By default this is `http://localhost:4173`.

The UI includes:

- **Console** page
  - Live console logs from Metro and DevTools.
  - Level filters (log/info/warn/error).
  - Detail drawer with copy-to-clipboard and timestamps.

- **Network** page
  - HTTP requests captured via an injected fetch wrapper / DevTools Network domain.
  - Detail drawer with headers, payload, and response preview (including text, JSON, images, and some binary types).

- **Header controls**
  - Global **device selector** (backed by the `deviceId` tagging in the CLI).
  - Global **capture toggles** for Console and Network streams.
  - Global **proxy WS status chip** (shows connection status and basic stats; click to reconnect when disconnected).
  - Global **DevTools status chip** (shows connected/closed/error and lets you request a DevTools reconnect from the UI).

---

## Storage & Redux inspection

The **Storage** page lets you inspect:

- **AsyncStorage** key/value pairs.
- **Redux** state (if you are using Redux).

To keep the CLI simple and avoid depending on your bundler setup, you need to expose these on the global object in your app:

### AsyncStorage

In your React Native app (for example in `App.tsx`):

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Make AsyncStorage visible to rn-inspector storage helper
(global as any).AsyncStorage = AsyncStorage;
```

Once this is set and the app is running with DevTools debugging enabled, the Storage page's **AsyncStorage** panel will show your keys and values.

### Redux store

If you use Redux, expose your store after you create it (anywhere in your app setup):

```ts
import { createStore } from 'redux';

const store = createStore(reducer);

// Expose Redux store for rn-inspector
(global as any).__RN_INSPECTOR_REDUX_STORE__ = store;
```

The Storage page's **Redux State** panel will then show `store.getState()` and update as your state changes.

If you do not expose these globals, the Storage page will show a helpful message explaining what to add in your app.

---

## Keyboard shortcuts (CLI)

While `rn-inspector` is running in a TTY, the CLI listens for a few simple shortcuts:

- `o` / `O`
  - Open the Web UI in your default browser (using `start` on Windows, `open` on macOS, or `xdg-open` on Linux).

- `r` / `R`
  - Print a hint on how to fully reload the CLI:
    - Press `Ctrl+C` to stop the process, then run `rn-inspector` again.

- `Ctrl+C`
  - Quit `rn-inspector`.

If the terminal does not support raw mode (no TTY), these shortcuts are safely disabled.

---

## Error handling & reconnection

- If the **Metro websocket** closes or errors, the CLI logs a message and sends a small `meta` event to the UI so you can see the status.
- For **DevTools websockets** (one per device):
  - The CLI emits `devtools` **status meta events** (`open`, `closed`, `error`) but does **not** auto-retry reconnecting.
  - The Web UI header exposes a **DevTools status chip**; clicking it sends a control message to the CLI to re-run DevTools discovery and attach again.
  - When DevTools auto-discovery finds no `/json` targets, the CLI logs a message *and* emits a warning `meta` event so the UI can surface a toast like “DevTools auto-discovery found no /json targets (falling back to Metro-only mode)”.

---

## Repository

This CLI is part of the **RN Inspector Monorepo**:

- GitHub: <https://github.com/afzaal-28/rn-inspector>

Please open issues or pull requests in that repository for bugs, feature requests, or contributions.