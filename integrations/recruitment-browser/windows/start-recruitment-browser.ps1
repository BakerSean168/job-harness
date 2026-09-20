param(
  [string]$RuntimeBaseUrl = 'https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1',
  [switch]$Once,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'JobHarness\RecruitmentBrowser'
$supervisorRoot = Join-Path $root 'Supervisor'
New-Item -ItemType Directory -Force -Path $supervisorRoot | Out-Null

$manifest = Invoke-RestMethod -Uri "$RuntimeBaseUrl/manifest.json" -Method Get -TimeoutSec 30
if ([int]$manifest.schemaVersion -ne 1 -or -not $manifest.supervisorVersion -or -not $manifest.supervisor) {
  throw 'Recruitment Browser runtime channel returned an invalid supervisor manifest.'
}

$version = [string]$manifest.supervisorVersion
$target = Join-Path $supervisorRoot "$version.ps1"
if (-not (Test-Path $target)) {
  $temp = "$target.download"
  Invoke-WebRequest -Uri "$RuntimeBaseUrl/files/$($manifest.supervisor.id)" -OutFile $temp -UseBasicParsing -TimeoutSec 45
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $temp).Hash.ToLowerInvariant()
  $expected = ([string]$manifest.supervisor.sha256).ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item -Force -LiteralPath $temp -ErrorAction SilentlyContinue
    throw "Recruitment Browser supervisor SHA-256 mismatch: $actual != $expected"
  }
  Move-Item -Force -LiteralPath $temp -Destination $target
}

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"' + $target + '"'),
  '-RuntimeBaseUrl', ('"' + $RuntimeBaseUrl + '"')
)
if ($Once) { $arguments += '-Once' }
if ($NoLaunch) { $arguments += '-NoLaunch' }

$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -PassThru
if ($Once) {
  $process.WaitForExit()
  exit $process.ExitCode
}
Write-Host "Job Harness Recruitment Browser Supervisor started: PID $($process.Id)"
