# go-mirror Usage Guide

## Two Modes of Operation

### 1. GUI Mode (Default)
Interactive device selection with built-in mirroring window.

**Features:**
- Terminal-based device selector
- Automatic device discovery (Android + iOS)
- Built-in video window (via ffplay)
- No piping required

**Usage:**
```bash
# Interactive mode - select from all available devices
go-mirror

# Direct Android device mirroring with window
go-mirror android

# Direct iOS simulator mirroring with window
go-mirror ios --simulator

# Specific device with window
go-mirror android --device emulator-5554
```

### 2. Headless Mode
Stream video to stdout for programmatic integration.

**Features:**
- Pure H.264 stream to stdout
- No GUI dependencies
- Pipe to any application
- Perfect for automation

**Usage:**
```bash
# Stream Android device to stdout
go-mirror android --headless

# Stream iOS simulator to stdout
go-mirror ios --simulator --headless

# Pipe to ffplay
go-mirror android --headless | ffplay -

# Pipe to your custom application
go-mirror android --headless | your-app

# Save to file
go-mirror android --output recording.h264
```

## Common Use Cases

### Development & Testing
```bash
# Quick device mirroring during development
go-mirror

# Mirror specific test device
go-mirror android --device emulator-5554
```

### Recording & Documentation
```bash
# Record Android session
go-mirror android --output demo.h264

# Record iOS simulator
go-mirror ios --simulator --output ios-demo.h264

# Convert to MP4 while recording
go-mirror android --headless | ffmpeg -i - -c:v copy demo.mp4
```

### Integration with Other Tools
```bash
# Stream to OBS or other streaming software
go-mirror android --headless | your-streaming-tool

# Stream to web server
go-mirror android --headless | your-web-server

# Process video frames
go-mirror android --headless | your-frame-processor
```

### CI/CD & Automation
```bash
# Automated testing with recording
go-mirror android --output test-session.h264 &
MIRROR_PID=$!
# Run your tests here
kill $MIRROR_PID

# Headless CI environment
go-mirror android --headless | ffmpeg -i - -vframes 1 screenshot.png
```

## Device Management

### List Available Devices
```bash
# List Android devices
go-mirror android --list

# List iOS simulators
go-mirror ios --list
```

### Device Selection
```bash
# Interactive selection (GUI mode)
go-mirror

# Specific Android device
go-mirror android --device emulator-5554

# Specific iOS simulator by UDID
go-mirror ios --udid <UDID>

# First available device (default)
go-mirror android
```

## Troubleshooting

### No Devices Found
- **Android**: Ensure `adb devices` shows your device
- **iOS**: Ensure simulator is booted (`xcrun simctl list`)

### ffplay Not Found (GUI Mode)
Install ffmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg
```

### Permission Issues (Android)
```bash
# Enable USB debugging on device
# Accept RSA key fingerprint when prompted
adb devices
```

### Video Quality Issues
The tool streams at device native resolution. For lower bandwidth:
```bash
# Use ffmpeg to scale down
go-mirror android --headless | ffmpeg -i - -vf scale=720:-1 -c:v libx264 output.mp4
```

## Advanced Examples

### Multi-Device Recording
```bash
# Record multiple devices simultaneously
go-mirror android --device device1 --output device1.h264 &
go-mirror android --device device2 --output device2.h264 &
wait
```

### Live Streaming to Network
```bash
# Stream to RTMP server
go-mirror android --headless | ffmpeg -i - -c:v copy -f flv rtmp://server/live/stream
```

### Frame Extraction
```bash
# Extract frames every second
go-mirror android --headless | ffmpeg -i - -vf fps=1 frame-%04d.png
```

### Custom Processing Pipeline
```bash
# Apply filters and effects
go-mirror android --headless | \
  ffmpeg -i - -vf "drawtext=text='Demo':x=10:y=10" \
  -c:v libx264 -preset fast output.mp4
```

## Performance Tips

1. **Low Latency**: GUI mode with ffplay provides lowest latency
2. **Recording**: Use `--output` for direct file writing (no piping overhead)
3. **Streaming**: Headless mode with minimal processing for best performance
4. **Multiple Devices**: Run separate instances for each device

## Requirements Summary

| Mode | Android | iOS | Additional |
|------|---------|-----|------------|
| GUI | adb | xcrun simctl | ffplay |
| Headless | adb | xcrun simctl | - |
| Recording | adb | xcrun simctl | - |

## Exit Codes

- `0`: Success
- `1`: Error (device not found, command failed, etc.)

## Environment Variables

Currently none required. All configuration via command-line flags.
