#!/bin/bash

# Example: Record Android device screen to MP4 file

OUTPUT_FILE="${1:-recording-$(date +%Y%m%d-%H%M%S).mp4}"

echo "Recording Android device to ${OUTPUT_FILE}"
echo "Press Ctrl+C to stop recording"

go-mirror android | ffmpeg -i - -c:v copy "${OUTPUT_FILE}"

echo "Recording saved to ${OUTPUT_FILE}"
