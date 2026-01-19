cd c:\rn-packages\rn-inspector\packages\go-mirror
go build -o "bin/go-mirror" ./cmd/go-mirror
$targets = @(
  @{GOOS="linux"; GOARCH="amd64"; OUT="bin/go-mirror-linux-amd64"},
  @{GOOS="linux"; GOARCH="arm64"; OUT="bin/go-mirror-linux-arm64"},
  @{GOOS="darwin"; GOARCH="amd64"; OUT="bin/go-mirror-darwin-amd64"},
  @{GOOS="darwin"; GOARCH="arm64"; OUT="bin/go-mirror-darwin-arm64"},
  @{GOOS="windows"; GOARCH="amd64"; OUT="bin/go-mirror-windows-amd64.exe"}
)
foreach ($t in $targets) {
  $env:GOOS=$t.GOOS; $env:GOARCH=$t.GOARCH
  go build -o $t.OUT ./cmd/go-mirror
}