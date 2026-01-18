# Go Mirror (Android)

Standalone Android screen mirror with a desktop receiver.

## Project Layout

- `android/` — Android capture app (Kotlin, MediaProjection + H.264 stream)
- `desktop/` — Desktop receiver (Go + ffplay GUI window)

## Android App (Capture)

1. Open `android/` in Android Studio.
2. Run the app on a device (Android 8+).
3. Enter desktop IP and port (default `7070`).
4. Tap **Start Screen Capture** and grant permission.

## Desktop Receiver

Build:

```bash
cd desktop

go build -o go-mirror
```

Build all desktop targets:

```bash
cd desktop

# macOS/Linux
./build.sh

# Windows PowerShell
./build.ps1
```

Run GUI window:

```bash
./go-mirror --listen :7070 --title "Android Mirror"
```

Headless recording:

```bash
./go-mirror --listen :7070 --no-window --record session.h264
```

MP4 recording (requires ffmpeg bundled or in PATH):

```bash
./go-mirror --listen :7070 --record session.mp4
```

## Build Android APK

From the repo root:

```bash
cd android

# macOS/Linux
./gradlew assembleRelease

# Windows PowerShell
./gradlew.bat assembleRelease
```

APK output:

```
android/app/build/outputs/apk/release/app-release.apk
```

If you see **"Gradle wrapper JAR not found"**, you need to generate the wrapper:

1. Install **Android Studio** (or Gradle), then open the `android/` folder and let it sync.
2. Run `gradle wrapper` (or use Android Studio's Gradle tool window) to create:
   `android/gradle/wrapper/gradle-wrapper.jar`.

After the wrapper JAR exists, `gradlew.bat` will work.

## Bundling ffplay/ffmpeg

To make the desktop binary fully standalone, place `ffplay` and `ffmpeg` in:

```
tools/ffmpeg/<os-arch>/
```

Supported folders:

- `tools/ffmpeg/windows-amd64/`
- `tools/ffmpeg/darwin-amd64/`
- `tools/ffmpeg/darwin-arm64/`
- `tools/ffmpeg/linux-amd64/`
- `tools/ffmpeg/linux-arm64/`

The build scripts will copy those binaries into `desktop/dist/` so the app runs without PATH.

You can also place `ffplay` and `ffmpeg` next to the desktop binary or in one of these locations:

- `./ffplay` / `./ffmpeg`
- `./ffmpeg/ffplay`
- `./ffmpeg/bin/ffplay`
- `./bin/ffplay`

## Notes

- Android sends raw H.264 Annex-B stream over TCP.
- Desktop receiver validates a small stream header before playback.
