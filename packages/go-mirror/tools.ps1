$ErrorActionPreference="Stop"
mkdir -Force tools/ffmpeg/windows-amd64
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z" -OutFile "tools/ffmpeg/windows-amd64/ffmpeg.7z"
& 7z x tools/ffmpeg/windows-amd64/ffmpeg.7z -otools/ffmpeg/windows-amd64/tmp
Copy-Item tools/ffmpeg/windows-amd64/tmp/bin/ffmpeg.exe tools/ffmpeg/windows-amd64/
Copy-Item tools/ffmpeg/windows-amd64/tmp/bin/ffplay.exe tools/ffmpeg/windows-amd64/
Remove-Item tools/ffmpeg/windows-amd64/ffmpeg.7z
Remove-Item -Recurse -Force tools/ffmpeg/windows-amd64/tmp
set -e
mkdir -p tools/ffmpeg/darwin-amd64
curl -L https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip -o tools/ffmpeg/darwin-amd64/ffmpeg.zip
curl -L https://evermeet.cx/ffmpeg/ffplay-6.1.1.zip -o tools/ffmpeg/darwin-amd64/ffplay.zip
unzip -o tools/ffmpeg/darwin-amd64/ffmpeg.zip -d tools/ffmpeg/darwin-amd64/
unzip -o tools/ffmpeg/darwin-amd64/ffplay.zip -d tools/ffmpeg/darwin-amd64/
rm tools/ffmpeg/darwin-amd64/*.zip
set -e
mkdir -p tools/ffmpeg/darwin-arm64
curl -L https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip -o tools/ffmpeg/darwin-arm64/ffmpeg.zip
curl -L https://evermeet.cx/ffmpeg/ffplay-6.1.1.zip -o tools/ffmpeg/darwin-arm64/ffplay.zip
unzip -o tools/ffmpeg/darwin-arm64/ffmpeg.zip -d tools/ffmpeg/darwin-arm64/
unzip -o tools/ffmpeg/darwin-arm64/ffplay.zip -d tools/ffmpeg/darwin-arm64/
rm tools/ffmpeg/darwin-arm64/*.zip
set -e
mkdir -p tools/ffmpeg/linux-amd64
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o tools/ffmpeg/linux-amd64/ffmpeg.tar.xz
tar -xf tools/ffmpeg/linux-amd64/ffmpeg.tar.xz -C tools/ffmpeg/linux-amd64 --strip-components=1
cp tools/ffmpeg/linux-amd64/ffmpeg tools/ffmpeg/linux-amd64/ffplay tools/ffmpeg/linux-amd64/
rm tools/ffmpeg/linux-amd64/ffmpeg.tar.xz
set -e
mkdir -p tools/ffmpeg/linux-arm64
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz -o tools/ffmpeg/linux-arm64/ffmpeg.tar.xz
tar -xf tools/ffmpeg/linux-arm64/ffmpeg.tar.xz -C tools/ffmpeg/linux-arm64 --strip-components=1
cp tools/ffmpeg/linux-arm64/ffmpeg tools/ffmpeg/linux-arm64/ffplay tools/ffmpeg/linux-arm64/
rm tools/ffmpeg/linux-arm64/ffmpeg.tar.xz