#!/bin/bash

# Example: Headless mode - stream iOS simulator to stdout

echo "Starting iOS simulator in headless mode..."
echo "Streaming to stdout - pipe to your application"

go-mirror ios --simulator --headless
