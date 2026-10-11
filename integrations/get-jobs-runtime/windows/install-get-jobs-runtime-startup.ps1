param(
  [string]$Distribution = 'Ubuntu-24.04',
  [string]$RuntimeStartPath = '$HOME/.local/share/job-harness/get-jobs-runtime/start.sh',
  [switch]$EnableAutoStart
)

$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'JobHarnessGetJobsRuntime.cmd'

if (-not $EnableAutoStart) {
  if (Test-Path -LiteralPath $launcher) {
    Remove-Item -Force -LiteralPath $launcher
    Write-Host "Removed legacy Startup launcher: $launcher"
  }
  Write-Host 'No Startup launcher is installed.'
  Write-Host 'Job Harness local runtimes are manual-start by default.'
  Write-Host 'Manual WSL start:'
  Write-Host "  wsl.exe -d $Distribution -- bash -lc $RuntimeStartPath start"
  Write-Host 'To explicitly opt in to Windows sign-in startup, rerun this script with -EnableAutoStart.'
  exit 0
}

$escapedPath = $RuntimeStartPath.Replace('"', '\"')
$content = @"
@echo off
start "" /min wsl.exe -d "$Distribution" -- bash -lc "$escapedPath start"
"@
Set-Content -LiteralPath $launcher -Value $content -Encoding ASCII

Write-Warning "Enabled Job Harness get_jobs Runtime auto-start by explicit request:"
Write-Host "  $launcher"
Write-Host "Distribution: $Distribution"
Write-Host "Runtime bootstrap: $RuntimeStartPath"
