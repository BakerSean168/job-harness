param(
  [ValidateSet('auto','edge','chrome')]
  [string]$Browser = 'auto',
  [switch]$ResetProfile,
  [int]$RemoteDebuggingPort = 9222,
  [string]$StartUrl = 'https://www.zhipin.com/web/geek/job'
)

$ErrorActionPreference = 'Stop'

$integrationRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$extension = Join-Path $integrationRoot 'extension'
if (-not (Test-Path (Join-Path $extension 'manifest.json'))) {
  throw "Missing Job Harness BOSS Copilot extension: $extension"
}

$edgeCandidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

function Find-Browser([string]$Name) {
  $candidates = if ($Name -eq 'edge') { $edgeCandidates } else { $chromeCandidates }
  return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

$browserExe = $null
$browserName = $Browser
if ($Browser -eq 'auto') {
  $browserExe = Find-Browser 'edge'
  $browserName = 'edge'
  if (-not $browserExe) {
    $browserExe = Find-Browser 'chrome'
    $browserName = 'chrome'
  }
} else {
  $browserExe = Find-Browser $Browser
}
if (-not $browserExe) {
  throw "No supported Edge/Chrome installation was found."
}

$root = Join-Path $env:LOCALAPPDATA 'JobHarness\BossCopilot'
$profile = Join-Path $root 'Profile'
if ($ResetProfile -and (Test-Path $profile)) {
  Remove-Item -Recurse -Force $profile
}
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$RemoteDebuggingPort",
  "--user-data-dir=`"$profile`"",
  "--load-extension=`"$extension`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--new-window',
  $StartUrl
)

Start-Process -FilePath $browserExe -ArgumentList $arguments
Write-Host "Job Harness BOSS Copilot compatibility browser started."
Write-Host "Browser: $browserName"
Write-Host "Executable: $browserExe"
Write-Host "Profile: $profile"
Write-Host "Extension: $extension"
Write-Host "CDP: http://127.0.0.1:$RemoteDebuggingPort"
Write-Host "BOSS automation remains paused until you click the Copilot '开始' button in the page overlay."
