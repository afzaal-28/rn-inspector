#!/bin/bash

# Build script for go-mirror
# Supports cross-compilation for Linux, macOS, and Windows

set -e

VERSION="0.1.0"
OUTPUT_DIR="./bin"

echo "Building go-mirror v${VERSION}..."

mkdir -p "${OUTPUT_DIR}"

# Build for current platform
echo "Building for current platform..."
go build -o "${OUTPUT_DIR}/go-mirror" ./cmd/go-mirror

# Cross-compile for other platforms
echo "Cross-compiling for Linux (amd64)..."
GOOS=linux GOARCH=amd64 go build -o "${OUTPUT_DIR}/go-mirror-linux-amd64" ./cmd/go-mirror

echo "Cross-compiling for Linux (arm64)..."
GOOS=linux GOARCH=arm64 go build -o "${OUTPUT_DIR}/go-mirror-linux-arm64" ./cmd/go-mirror

echo "Cross-compiling for macOS (amd64)..."
GOOS=darwin GOARCH=amd64 go build -o "${OUTPUT_DIR}/go-mirror-darwin-amd64" ./cmd/go-mirror

echo "Cross-compiling for macOS (arm64)..."
GOOS=darwin GOARCH=arm64 go build -o "${OUTPUT_DIR}/go-mirror-darwin-arm64" ./cmd/go-mirror

echo "Cross-compiling for Windows (amd64)..."
GOOS=windows GOARCH=amd64 go build -o "${OUTPUT_DIR}/go-mirror-windows-amd64.exe" ./cmd/go-mirror

echo ""
echo "Build complete! Binaries are in ${OUTPUT_DIR}/"
ls -lh "${OUTPUT_DIR}/"
