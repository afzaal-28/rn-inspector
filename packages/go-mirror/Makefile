.PHONY: build clean install test run-android run-ios help

BINARY_NAME=go-mirror
VERSION=0.1.0
BUILD_DIR=./bin

build:
	@echo "Building $(BINARY_NAME)..."
	@go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/go-mirror

build-all:
	@echo "Cross-compiling for all platforms..."
	@./build.sh

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@rm -f $(BINARY_NAME) $(BINARY_NAME).exe

install: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/

test:
	@echo "Running tests..."
	@go test -v ./...

run-android:
	@echo "Running Android mirror (pipe to ffplay)..."
	@go run ./cmd/go-mirror android | ffplay -

run-ios:
	@echo "Running iOS simulator mirror (pipe to ffplay)..."
	@go run ./cmd/go-mirror ios --simulator | ffplay -

help:
	@echo "Available targets:"
	@echo "  build      - Build for current platform"
	@echo "  build-all  - Cross-compile for all platforms"
	@echo "  clean      - Remove build artifacts"
	@echo "  install    - Install to /usr/local/bin"
	@echo "  test       - Run tests"
	@echo "  run-android - Test Android mirroring"
	@echo "  run-ios    - Test iOS mirroring"
	@echo "  help       - Show this help message"
