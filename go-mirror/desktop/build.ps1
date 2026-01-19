$ErrorActionPreference = "Stop"

$dist = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $dist)) {
  New-Item -ItemType Directory -Path $dist | Out-Null
}

$targets = @(
  @{GOOS="windows"; GOARCH="amd64"; OUT="go-mirror-windows-amd64.exe"},
  @{GOOS="darwin"; GOARCH="amd64"; OUT="go-mirror-darwin-amd64"},
  @{GOOS="darwin"; GOARCH="arm64"; OUT="go-mirror-darwin-arm64"},
  @{GOOS="linux"; GOARCH="amd64"; OUT="go-mirror-linux-amd64"},
  @{GOOS="linux"; GOARCH="arm64"; OUT="go-mirror-linux-arm64"}
)

foreach ($t in $targets) {
  $env:GOOS = $t.GOOS
  $env:GOARCH = $t.GOARCH
  go build -o (Join-Path $dist $t.OUT)

  $toolsDir = Join-Path $PSScriptRoot ("..\tools\ffmpeg\" + $t.GOOS + "-" + $t.GOARCH)
  if (Test-Path $toolsDir) {
    Get-ChildItem -Path $toolsDir -Filter "ffmpeg*" -ErrorAction SilentlyContinue | Copy-Item -Destination $dist -Force
    Get-ChildItem -Path $toolsDir -Filter "ffplay*" -ErrorAction SilentlyContinue | Copy-Item -Destination $dist -Force
  }
}
