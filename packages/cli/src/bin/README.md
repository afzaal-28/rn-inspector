# Mirror Binaries

Place platform-specific mirror binaries here. The CLI will use these binaries to stream device video without screenshot polling.

We include a Rust mirror implementation in `mirror-rs/`. Build it and copy the platform binaries here.

## Expected Layout

```
packages/cli/src/bin/
  darwin/
    mirror
  linux/
    mirror
  win32/
    mirror.exe
```

## Requirements

- Binaries must be MIT-compatible (per project policy).
- The binary should stream **continuous video** to stdout in a format the CLI expects.
- Provide binaries for **macOS (darwin)**, **Linux**, and **Windows**.

## Notes

- This repository does not ship third-party binaries.
- Provide your own binaries and ensure license compliance.
- Once binaries are added, the CLI will be updated to invoke them per OS.
