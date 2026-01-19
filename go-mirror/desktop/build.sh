#!/usr/bin/env bash
set -euo pipefail

mkdir -p dist

copy_tools() {
  local os_arch="$1"
  local target_dir="$2"
  local tools_dir="../tools/ffmpeg/${os_arch}"
  if [ -d "$tools_dir" ]; then
    mkdir -p "$target_dir"
    cp "$tools_dir"/ffmpeg* "$target_dir"/ 2>/dev/null || true
    cp "$tools_dir"/ffplay* "$target_dir"/ 2>/dev/null || true
  fi
}

env GOOS=windows GOARCH=amd64 go build -o dist/go-mirror-windows-amd64.exe
copy_tools "windows-amd64" "dist"

env GOOS=darwin GOARCH=amd64 go build -o dist/go-mirror-darwin-amd64
copy_tools "darwin-amd64" "dist"

env GOOS=darwin GOARCH=arm64 go build -o dist/go-mirror-darwin-arm64
copy_tools "darwin-arm64" "dist"

env GOOS=linux GOARCH=amd64 go build -o dist/go-mirror-linux-amd64
copy_tools "linux-amd64" "dist"

env GOOS=linux GOARCH=arm64 go build -o dist/go-mirror-linux-arm64
copy_tools "linux-arm64" "dist"
