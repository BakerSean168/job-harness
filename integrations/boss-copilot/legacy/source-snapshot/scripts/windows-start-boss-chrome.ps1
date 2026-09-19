$ErrorActionPreference = 'Stop'

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) {
  throw 'Google Chrome was not found. Install Chrome or edit the candidate paths in this script.'
}

$root = Join-Path $env:LOCALAPPDATA 'JobApplicationCopilot'
$profile = Join-Path $root 'ChromeProfile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=9222',
  "--user-data-dir=`"$profile`"", 
  '--no-first-run',
  '--no-default-browser-check',
  'https://www.zhipin.com/web/geek/job'
)

Start-Process -FilePath $chrome -ArgumentList $arguments
Write-Host "Job Application Copilot Chrome started."
Write-Host "Profile: $profile"
Write-Host "CDP: http://127.0.0.1:9222"
Write-Host "Use this dedicated window for BOSS login and screening."
