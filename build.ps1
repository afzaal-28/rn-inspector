[CmdletBinding()]
param(
  [switch]$Publish
)

$Root = Split-Path -Parent $PSCommandPath
Push-Location $Root

function Clean-Dir {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Path
  }
}

try {
  Write-Host "== rn-inspector build ==" -ForegroundColor Cyan

  Write-Host "Cleaning workspaces..." -ForegroundColor DarkGray
  Clean-Dir "$Root/node_modules"
  Clean-Dir "$Root/packages/cli/node_modules"
  Clean-Dir "$Root/packages/cli/dist"
  Clean-Dir "$Root/packages/cli/ui"
  Clean-Dir "$Root/packages/ui/node_modules"
  Clean-Dir "$Root/packages/ui/dist"

  Write-Host "Installing deps..." -ForegroundColor DarkGray
  pnpm install

  Write-Host "Formatting with Prettier..." -ForegroundColor DarkGray
  pnpm prettier:fix

  Write-Host "Building workspaces..." -ForegroundColor DarkGray
  pnpm run build

  Write-Host "Syncing UI assets into CLI..." -ForegroundColor DarkGray
  Copy-Item -Recurse -Force "$Root/packages/ui/dist" "$Root/packages/cli/ui"

  if ($Publish) {
    Write-Host "Publish requires -Publish switch. Publishing packages/cli to npm..." -ForegroundColor DarkGray
    $answer = Read-Host "Publish packages/cli to npm? (y/N)"
    if ($answer -match '^[Yy]') {
      Push-Location "$Root/packages/cli"
      try {
        pnpm publish --access public
      }
      finally {
        Pop-Location
      }
    }
    else {
      Write-Host "Publish skipped." -ForegroundColor Yellow
    }
  }

  Write-Host "Done." -ForegroundColor Green
}
finally {
  Pop-Location
}