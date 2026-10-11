param(
  [string]$RuntimeBaseUrl = 'https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1',
  [switch]$EnableAutoStart,
  [switch]$LaunchNow
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'start-recruitment-browser.ps1'
if (-not (Test-Path $source)) { throw "Missing bootstrap script: $source" }

$root = Join-Path $env:LOCALAPPDATA 'JobHarness\RecruitmentBrowser'
$bootstrapRoot = Join-Path $root 'Bootstrap'
$bootstrap = Join-Path $bootstrapRoot 'start-recruitment-browser.ps1'
New-Item -ItemType Directory -Force -Path $bootstrapRoot | Out-Null
Copy-Item -Force -LiteralPath $source -Destination $bootstrap

Write-Host "Installed Recruitment Browser bootstrap:"
Write-Host "  $bootstrap"
Write-Host "Manual start:"
Write-Host "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrap -RuntimeBaseUrl $RuntimeBaseUrl"

$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'JobHarnessRecruitmentBrowser.cmd'

if ($EnableAutoStart) {
  $command = '@echo off' + [Environment]::NewLine +
    'start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $bootstrap + '" -RuntimeBaseUrl "' + $RuntimeBaseUrl + '"' + [Environment]::NewLine
  Set-Content -LiteralPath $launcher -Value $command -Encoding ASCII
  Write-Warning "Enabled per-user auto-start by explicit request: $launcher"
} else {
  if (Test-Path -LiteralPath $launcher) {
    Remove-Item -Force -LiteralPath $launcher
    Write-Host "Removed legacy per-user auto-start launcher: $launcher"
  }
  Write-Host 'Auto-start is disabled. Use -EnableAutoStart only if you explicitly want Windows sign-in startup.'
}

if ($LaunchNow) {
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"' + $bootstrap + '"'),
    '-RuntimeBaseUrl', ('"' + $RuntimeBaseUrl + '"')
  )
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -PassThru
  Write-Host "Started Recruitment Browser bootstrap by explicit request: PID $($process.Id)"
} else {
  Write-Host 'Recruitment Browser was not started. Start it manually when needed.'
}
