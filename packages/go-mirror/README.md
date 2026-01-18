# go-mirror

A **cross-platform CLI tool** for **live screen mirroring and streaming** from **Android and iOS simulators/devices** to **Linux, macOS, and Windows**.

`go-mirror` is written in **Go** and focuses on:

* Simple CLI usage
* Native binaries (no runtime dependencies)
* Streaming-first architecture (stdout, ffmpeg, WebSocket, files)
* Reusing proven platform tools (adb, simctl, ReplayKit, MediaProjection)

> This project is designed as a low-level mirroring engine that can be piped into players, recorders, or future GUI frontends.

---

## ✨ Features

### Dual Mode Operation

* **GUI Mode**: Interactive device selection + built-in mirroring window
* **Headless Mode**: Stream to stdout for programmatic integration

### Android

* Live screen mirroring via `adb`
* H.264 stream output
* Device auto-detection and selection
* Low-latency streaming pipeline

### iOS

* Simulator mirroring via `xcrun simctl`
* H.264 codec support
* Booted simulator auto-detection
* Real-device support (planned)

### Streaming & Output

* GUI window rendering (via ffplay)
* Pipe to stdout for custom applications
* Save recordings to file
* Headless / CI-friendly usage
* WebSocket streaming (planned)

---

## 📦 Installation

### Prerequisites

* Go **1.21+**
* Platform tools:

  * **Android**: `adb` (Android Platform Tools)
  * **iOS (macOS only)**: Xcode + `xcrun`
  * **GUI Mode**: `ffplay` (from ffmpeg package)
  * **Headless Mode**: No additional requirements

### Clone

```bash
git clone https://github.com/yourname/go-mirror.git
cd go-mirror
```

### Build

```bash
go build -o go-mirror
```

---

## 🚀 Usage

### Two Modes of Operation

**1. GUI Mode (Default)**
- Interactive device selection
- Built-in mirroring window
- No piping required

**2. Headless Mode**
- Stream to stdout for programmatic use
- Pipe to other applications
- Use `--headless` flag

### Help

```bash
go-mirror --help
```

### GUI Mode – Interactive Mirroring

Simply run without arguments to launch device selector:

```bash
go-mirror
```

Or specify platform and device:

```bash
# Android with GUI window
go-mirror android --device emulator-5554

# iOS simulator with GUI window
go-mirror ios --simulator
```

### Headless Mode – Streaming to Stdout

Use `--headless` flag to stream video data:

```bash
# Android device to ffplay
go-mirror android --headless | ffplay -

# iOS simulator to ffplay
go-mirror ios --simulator --headless | ffplay -

# Pipe to your own application
go-mirror android --headless | your-custom-app

# Save to file
go-mirror android --output recording.h264
```

---

## 🧠 How It Works

### Architecture

* **Android**: Uses `adb exec-out screenrecord` to stream H.264 frames
* **iOS Simulator**: Uses `xcrun simctl io booted recordVideo` with stdout piping
* **CLI**: Acts as a controller + stream router

### GUI Mode Flow

```text
Device → go-mirror → ffplay window
```

1. User selects device from interactive list
2. go-mirror starts platform-specific capture
3. Video stream pipes to ffplay for rendering
4. Window displays live device screen

### Headless Mode Flow

```text
Device → go-mirror → stdout → your-app / ffplay / file
```

1. go-mirror streams H.264 to stdout
2. Output can be piped to any application
3. Ideal for automation, recording, or custom processing

---

## 📁 Project Structure

```text
go-mirror/
├── cmd/
│   └── go-mirror/
│       └── main.go          # CLI entry point with GUI/headless modes
├── internal/
│   ├── android/
│   │   └── adb.go           # Android device mirroring
│   ├── ios/
│   │   └── simctl.go        # iOS simulator mirroring
│   ├── gui/
│   │   ├── selector.go      # Device selection UI
│   │   ├── window.go        # Mirror window (ffplay)
│   │   └── player.go        # Video player (alternative)
│   └── stream/
│       └── video.go         # Stream utilities
├── examples/                 # Usage examples
├── go.mod
├── Makefile
└── README.md
```

---

## 🛠 Development

Run locally:

```bash
go run ./cmd/go-mirror --help
```

Cross-compile:

```bash
GOOS=linux GOARCH=amd64 go build -o go-mirror
GOOS=windows GOARCH=amd64 go build -o go-mirror.exe
GOOS=darwin GOARCH=amd64 go build -o go-mirror
```

---

## 🗺 Roadmap

* [ ] Android low-latency mode (scrcpy protocol)
* [ ] iOS real-device mirroring
* [ ] WebSocket streaming
* [ ] Recording profiles (mp4 / mkv)
* [ ] Config file support
* [ ] GUI frontend (Tauri)

---

## ⚠️ Limitations

* iOS real-device mirroring requires macOS and Xcode
* DRM-protected screens cannot be captured
* Audio streaming is not supported yet

---

## 📜 License

MIT License

---

## 🤝 Contributing

Pull requests are welcome.

If you plan a major change, please open an issue first to discuss the design.

---

## 👤 Author

Afzaal

Built for developers who want **fast, scriptable, cross-platform screen mirroring**.
