$ErrorActionPreference = "Stop"

$BaseUrl = "https://oracle.taile92a8e.ts.net:10443"
$InstallRoot = Join-Path $env:LOCALAPPDATA "JobApplicationCopilot"
$ExtensionDir = Join-Path $InstallRoot "extension"
$StagingDir = Join-Path $InstallRoot "staging"
$ZipPath = Join-Path $InstallRoot "job-application-copilot-latest.zip"

Write-Host "Job Application Copilot - private updater" -ForegroundColor Cyan
Write-Host "Channel: $BaseUrl"

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$Channel = Invoke-RestMethod -Uri "$BaseUrl/channel.json" -Method Get
$DownloadUrl = "$BaseUrl$($Channel.extension.latestDownloadPath)"

Write-Host "Downloading version $($Channel.extension.version)..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing

$ActualSha = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$ExpectedSha = [string]$Channel.extension.sha256
if ($ActualSha -ne $ExpectedSha.ToLowerInvariant()) {
  throw "SHA-256 mismatch. Expected $ExpectedSha, got $ActualSha"
}
Write-Host "SHA-256 verified." -ForegroundColor Green

if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null
Expand-Archive -Path $ZipPath -DestinationPath $StagingDir -Force

$BackupDir = Join-Path $InstallRoot "extension.previous"
if (Test-Path $BackupDir) { Remove-Item -Recurse -Force $BackupDir }
if (Test-Path $ExtensionDir) { Move-Item -Path $ExtensionDir -Destination $BackupDir }
Move-Item -Path $StagingDir -Destination $ExtensionDir

$State = @{
  version = $Channel.extension.version
  installedAt = (Get-Date).ToString("o")
  channel = $BaseUrl
  sha256 = $ActualSha
} | ConvertTo-Json
$State | Set-Content -Path (Join-Path $InstallRoot "install-state.json") -Encoding UTF8

Set-Clipboard -Value $ExtensionDir
Write-Host ""
Write-Host "Installed to:" -ForegroundColor Green
Write-Host "  $ExtensionDir"
Write-Host ""
Write-Host "The extension path has been copied to your clipboard."
Write-Host "First install: open chrome://extensions -> Developer mode -> Load unpacked -> paste the path above."
Write-Host "Future code updates: run this updater again, then click Reload on the extension card."
Write-Host "Resume/profile updates do NOT require reinstalling; use '从 Oracle2 同步资料' in the extension."
