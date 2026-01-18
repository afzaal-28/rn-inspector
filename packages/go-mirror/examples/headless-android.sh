#!/bin/bash

# Example: Headless mode - stream Android device to stdout

echo "Starting Android device in headless mode..."
echo "Streaming to stdout - pipe to your application"

go-mirror android --headless
