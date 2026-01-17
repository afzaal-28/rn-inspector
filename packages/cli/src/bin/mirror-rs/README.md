# rn-inspector mirror (Rust)

This is a **cross‑platform** mirror binary written in Rust. It connects to a **companion stream** running on the device (or simulator) and emits JSONL frames to stdout for the CLI to forward to the UI.

## Build

```bash
cargo build --release
```

Copy the resulting binary:

- macOS: `target/release/mirror` → `packages/cli/src/bin/darwin/mirror`
- Linux: `target/release/mirror` → `packages/cli/src/bin/linux/mirror`
- Windows: `target\release\mirror.exe` → `packages/cli/src/bin/win32/mirror.exe`

## Protocol (device → desktop)

The mirror binary expects a TCP stream (default `127.0.0.1:27183`) with frames encoded as:

```
[1 byte mime_id][4 bytes big-endian frame_length][frame_bytes]
```

Mime id mapping:
- `1` → `image/png`
- `2` → `image/jpeg`
- `3` → `image/webp`

The mirror binary converts frames to JSONL:

```json
{"type":"frame","mime":"image/png","data":"<base64>"}
```

Errors are emitted as:

```json
{"type":"error","error":"..."}
```

## Companion app

You need a **device-side companion** to capture the screen (e.g. Android MediaProjection, iOS ReplayKit) and stream frames to the desktop over TCP. The Rust binary only handles the **desktop client** and JSONL output.

## Android convenience

If `--platform android` is used, the binary will run:

```
adb forward tcp:27183 tcp:27183
```

So the companion can listen on `127.0.0.1:27183` on the device.

## CLI usage

The CLI invokes the binary automatically. You can run it directly:

```bash
./mirror --platform android --device <adb-id> --port 27183
```
