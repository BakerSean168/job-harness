param(
  [string]$RuntimeBaseUrl = 'https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1',
  [switch]$SkipAutoStart,
  [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'start-recruitment-browser.ps1'
if (-not (Test-Path $source)) { throw "Missing bootstrap script: $source" }

$root = Join-Path $env:LOCALAPPDATA 'JobHarness\RecruitmentBrowser'
$bootstrapRoot = Join-Path $root 'Bootstrap'
$bootstrap = Join-Path $bootstrapRoot 'start-recruitment-browser.ps1'
New-Item -ItemType Directory -Force -Path $bootstrapRoot | Out-Null
Copy-Item -Force -LiteralPath $source -Destination $bootstrap

if (-not $SkipAutoStart) {
  $startup = [Environment]::GetFolderPath('Startup')
  $launcher = Join-Path $startup 'JobHarnessRecruitmentBrowser.cmd'
  $command = '@echo off' + [Environment]::NewLine +
    'start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $bootstrap + '" -RuntimeBaseUrl "' + $RuntimeBaseUrl + '"' + [Environment]::NewLine
  Set-Content -LiteralPath $launcher -Value $command -Encoding ASCII
  Write-Host "Installed per-user auto-start launcher: $launcher"
}

if (-not $SkipLaunch) {
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"' + $bootstrap + '"'),
    '-RuntimeBaseUrl', ('"' + $RuntimeBaseUrl + '"')
  )
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -PassThru
  Write-Host "Started Recruitment Browser bootstrap: PID $($process.Id)"
}
