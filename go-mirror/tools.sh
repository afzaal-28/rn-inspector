#!/bin/bash
# Stop on any error
set -e

echo "Starting FFmpeg multi-platform download script (2026)..."

# Ensure extraction tools are installed on Fedora
# sudo dnf install p7zip curl tar unzip -y

# --- Windows amd64 ---
# Using Gyan.dev Git-full builds (updated Jan 2026)
mkdir -p tools/ffmpeg/windows-amd64
echo "Downloading Windows amd64..."
curl -L "https://www.gyan.dev" -o tools/ffmpeg/windows-amd64/ffmpeg.7z
mkdir -p tools/ffmpeg/windows-amd64/tmp
# Extracting .7z on Linux requires p7zip (7z command)
7z x tools/ffmpeg/windows-amd64/ffmpeg.7z -otools/ffmpeg/windows-amd64/tmp
# Find binaries inside the nested versioned folder and move to target
find tools/ffmpeg/windows-amd64/tmp -name "ffmpeg.exe" -exec cp {} tools/ffmpeg/windows-amd64/ \;
find tools/ffmpeg/windows-amd64/tmp -name "ffplay.exe" -exec cp {} tools/ffmpeg/windows-amd64/ \;
rm -rf tools/ffmpeg/windows-amd64/ffmpeg.7z tools/ffmpeg/windows-amd64/tmp

# --- Darwin (macOS) amd64 & arm64 ---
# Using Evermeet.cx static builds (6.1.1 is stable for 2026)
for ARCH in amd64 arm64; do
    echo "Downloading Darwin $ARCH..."
    mkdir -p tools/ffmpeg/darwin-$ARCH
    curl -L "https://evermeet.cx" -o tools/ffmpeg/darwin-$ARCH/ffmpeg.zip
    curl -L "https://evermeet.cx" -o tools/ffmpeg/darwin-$ARCH/ffplay.zip
    unzip -o tools/ffmpeg/darwin-$ARCH/ffmpeg.zip -d tools/ffmpeg/darwin-$ARCH/
    unzip -o tools/ffmpeg/darwin-$ARCH/ffplay.zip -d tools/ffmpeg/darwin-$ARCH/
    rm tools/ffmpeg/darwin-$ARCH/*.zip
done

# --- Linux amd64 ---
# Using reliable static mirror for 2026
echo "Downloading Linux amd64..."
mkdir -p tools/ffmpeg/linux-amd64
curl -L "https://ffmpeg.martin-riedl.de" -o tools/ffmpeg/linux-amd64/ffmpeg.zip
curl -L "https://ffmpeg.martin-riedl.de" -o tools/ffmpeg/linux-amd64/ffplay.zip
unzip -o tools/ffmpeg/linux-amd64/ffmpeg.zip -d tools/ffmpeg/linux-amd64/
unzip -o tools/ffmpeg/linux-amd64/ffplay.zip -d tools/ffmpeg/linux-amd64/
rm tools/ffmpeg/linux-amd64/*.zip
chmod +x tools/ffmpeg/linux-amd64/ffmpeg tools/ffmpeg/linux-amd64/ffplay

# --- Linux arm64 ---
echo "Downloading Linux arm64..."
mkdir -p tools/ffmpeg/linux-arm64
curl -L "https://ffmpeg.martin-riedl.de" -o tools/ffmpeg/linux-arm64/ffmpeg.zip
curl -L "https://ffmpeg.martin-riedl.de" -o tools/ffmpeg/linux-arm64/ffplay.zip
unzip -o tools/ffmpeg/linux-arm64/ffmpeg.zip -d tools/ffmpeg/linux-arm64/
unzip -o tools/ffmpeg/linux-arm64/ffplay.zip -d tools/ffmpeg/linux-arm64/
rm tools/ffmpeg/linux-arm64/*.zip
chmod +x tools/ffmpeg/linux-arm64/ffmpeg tools/ffmpeg/linux-arm64/ffplay

echo "All tools downloaded and organized successfully."
