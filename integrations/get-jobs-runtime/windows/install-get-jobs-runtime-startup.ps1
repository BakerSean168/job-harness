param(
  [string]$Distribution = 'Ubuntu-24.04',
  [string]$RuntimeStartPath = '$HOME/.local/share/job-harness/get-jobs-runtime/start.sh'
)

$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'JobHarnessGetJobsRuntime.cmd'
$escapedPath = $RuntimeStartPath.Replace('"', '\"')
$content = @"
@echo off
start "" /min wsl.exe -d "$Distribution" -- bash -lc "$escapedPath start"
"@
Set-Content -LiteralPath $launcher -Value $content -Encoding ASCII

Write-Host "Installed Job Harness get_jobs Runtime startup launcher:"
Write-Host "  $launcher"
Write-Host "Distribution: $Distribution"
Write-Host "Runtime bootstrap: $RuntimeStartPath"
