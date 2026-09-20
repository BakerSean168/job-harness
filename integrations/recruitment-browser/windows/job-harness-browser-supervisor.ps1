param(
  [string]$RuntimeBaseUrl = 'https://oracle.taile92a8e.ts.net:20901/runtime/recruitment-browser/v1',
  [ValidateSet('auto','edge','chrome')]
  [string]$Browser = 'auto',
  [int]$RemoteDebuggingPort = 9222,
  [int]$PollSeconds = 60,
  [switch]$Once,
  [switch]$ResetProfile,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'JobHarness\RecruitmentBrowser'
$runtimeRoot = Join-Path $root 'Runtime'
$bundleRoot = Join-Path $runtimeRoot 'bundles'
$currentRoot = Join-Path $runtimeRoot 'current'
$profile = Join-Path $root 'Profile'
$statePath = Join-Path $root 'supervisor-state.json'

function Get-DedicatedBrowserProcesses {
  $escapedProfile = [Regex]::Escape($profile)
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '^(msedge|chrome)\.exe$' -and
      $_.CommandLine -and
      $_.CommandLine -match $escapedProfile
    })
}

function Stop-JobHarnessBrowser {
  $processes = Get-DedicatedBrowserProcesses
  foreach ($process in $processes) {
    try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop } catch {}
  }
  if ($processes.Count -gt 0) {
    Start-Sleep -Milliseconds 600
  }
}

New-Item -ItemType Directory -Force -Path $root, $runtimeRoot, $bundleRoot, $profile | Out-Null

if ($ResetProfile -and (Test-Path $profile)) {
  Stop-JobHarnessBrowser
  Remove-Item -Recurse -Force $profile
  New-Item -ItemType Directory -Force -Path $profile | Out-Null
}

function Write-SupervisorState([hashtable]$Patch) {
  $state = @{}
  if (Test-Path $statePath) {
    try {
      $existing = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
      if ($existing) {
        foreach ($property in $existing.PSObject.Properties) { $state[$property.Name] = $property.Value }
      }
    } catch {}
  }
  foreach ($key in $Patch.Keys) { $state[$key] = $Patch[$key] }
  $state['updatedAt'] = [DateTime]::UtcNow.ToString('o')
  $temp = "$statePath.tmp"
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -Force -LiteralPath $temp -Destination $statePath
}

function Get-AppPath([string]$Exe) {
  foreach ($key in @(
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$Exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$Exe"
  )) {
    $item = Get-ItemProperty $key -ErrorAction SilentlyContinue
    if ($item -and $item.'(default)') { return $item.'(default)' }
  }
  return $null
}

function Find-Browser([string]$Name) {
  $candidates = if ($Name -eq 'edge') {
    @(
      (Get-AppPath 'msedge.exe'),
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
      "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    )
  } else {
    @(
      (Get-AppPath 'chrome.exe'),
      $(if ($env:SCOOP) { Join-Path $env:SCOOP 'apps\googlechrome\current\chrome.exe' }),
      "$env:USERPROFILE\scoop\apps\googlechrome\current\chrome.exe",
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
  }
  return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

function Resolve-Browser {
  if ($Browser -eq 'edge') {
    $exe = Find-Browser 'edge'
    if (-not $exe) { throw 'Microsoft Edge was not found.' }
    return @{ Name = 'edge'; Exe = $exe }
  }
  if ($Browser -eq 'chrome') {
    $exe = Find-Browser 'chrome'
    if (-not $exe) { throw 'Google Chrome was not found.' }
    return @{ Name = 'chrome'; Exe = $exe }
  }
  $edge = Find-Browser 'edge'
  if ($edge) { return @{ Name = 'edge'; Exe = $edge } }
  $chrome = Find-Browser 'chrome'
  if ($chrome) { return @{ Name = 'chrome'; Exe = $chrome } }
  throw 'No supported Edge/Chrome installation was found.'
}

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Download-VerifiedFile([string]$BaseUrl, [object]$File, [string]$DestinationRoot) {
  $destination = Join-Path $DestinationRoot ($File.installPath -replace '/', '\')
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $temp = "$destination.download"
  $url = "$BaseUrl/files/$($File.id)"
  Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing -TimeoutSec 45
  $actual = Get-FileSha256 $temp
  $expected = [string]$File.sha256
  if ($actual -ne $expected.ToLowerInvariant()) {
    Remove-Item -Force -LiteralPath $temp -ErrorAction SilentlyContinue
    throw "SHA-256 mismatch for $($File.id): $actual != $expected"
  }
  Move-Item -Force -LiteralPath $temp -Destination $destination
}

function Read-CurrentBundleVersion {
  $manifestPath = Join-Path $currentRoot 'runtime-manifest.json'
  if (-not (Test-Path $manifestPath)) { return '' }
  try {
    return [string]((Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json).bundleVersion)
  } catch {
    return ''
  }
}

function Sync-RuntimeBundle {
  $manifestUrl = "$RuntimeBaseUrl/manifest.json"
  $manifest = Invoke-RestMethod -Uri $manifestUrl -Method Get -TimeoutSec 30
  if ([int]$manifest.schemaVersion -ne 1 -or -not $manifest.bundleVersion) {
    throw 'Runtime channel returned an unsupported manifest.'
  }

  $version = [string]$manifest.bundleVersion
  $bundle = Join-Path $bundleRoot $version
  $readyMarker = Join-Path $bundle 'runtime-manifest.json'

  if (-not (Test-Path $readyMarker)) {
    $staging = "$bundle.staging"
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    try {
      foreach ($extension in @($manifest.extensions)) {
        foreach ($file in @($extension.files)) {
          Download-VerifiedFile $RuntimeBaseUrl $file $staging
        }
      }
      $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $staging 'runtime-manifest.json') -Encoding UTF8
      Move-Item -LiteralPath $staging -Destination $bundle
    } catch {
      Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
      throw
    }
  }

  $currentVersion = Read-CurrentBundleVersion
  if ($currentVersion -ne $version) {
    $previousLabel = if ($currentVersion) { $currentVersion.Substring(0, [Math]::Min(12, $currentVersion.Length)) } else { 'none' }
    Write-Host "Promoting Recruitment Browser runtime $($version.Substring(0, 12)) (previous $previousLabel)"
    Stop-JobHarnessBrowser
    $previous = Join-Path $runtimeRoot 'previous'
    Remove-Item -Recurse -Force $previous -ErrorAction SilentlyContinue
    if (Test-Path $currentRoot) {
      Move-Item -LiteralPath $currentRoot -Destination $previous
    }
    Copy-Item -Recurse -Force -LiteralPath $bundle -Destination $currentRoot
  }

  Write-SupervisorState @{
    runtimeBaseUrl = $RuntimeBaseUrl
    bundleVersion = $version
    supervisorVersion = [string]$manifest.supervisorVersion
    runtimeStatus = 'ready'
  }
  return $manifest
}

function Start-JobHarnessBrowser($Manifest) {
  if ($NoLaunch) { return }
  if ((Get-DedicatedBrowserProcesses).Count -gt 0) { return }

  $resolved = Resolve-Browser
  $extensionDirs = @()
  foreach ($extension in @($Manifest.extensions)) {
    $extensionDir = Join-Path $currentRoot ([string]$extension.installDirectory -replace '/', '\')
    if (-not (Test-Path (Join-Path $extensionDir 'manifest.json'))) {
      throw "Runtime extension is incomplete: $extensionDir"
    }
    $extensionDirs += $extensionDir
  }
  if ($extensionDirs.Count -eq 0) { throw 'Runtime manifest contains no extensions.' }

  $extensionsArgument = ($extensionDirs -join ',')
  $startUrls = @($Manifest.extensions | ForEach-Object { @($_.startUrls) } | Where-Object { $_ } | Select-Object -Unique)
  if ($startUrls.Count -eq 0) { $startUrls = @('about:blank') }

  $arguments = @(
    '--remote-debugging-address=127.0.0.1',
    "--remote-debugging-port=$RemoteDebuggingPort",
    "--user-data-dir=$profile",
    "--disable-extensions-except=$extensionsArgument",
    "--load-extension=$extensionsArgument",
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window'
  ) + $startUrls

  $process = Start-Process -FilePath $resolved.Exe -ArgumentList $arguments -PassThru
  Write-SupervisorState @{
    browser = $resolved.Name
    browserExecutable = $resolved.Exe
    browserPid = $process.Id
    browserStatus = 'running'
    profile = $profile
    remoteDebuggingPort = $RemoteDebuggingPort
  }
  Write-Host "Job Harness Recruitment Browser started: $($resolved.Name), PID $($process.Id)"
}

function Run-SupervisorIteration {
  try {
    $manifest = Sync-RuntimeBundle
    Start-JobHarnessBrowser $manifest
    if (-not $NoLaunch -and (Get-DedicatedBrowserProcesses).Count -eq 0) {
      throw 'Dedicated browser did not remain running after launch.'
    }
    Write-SupervisorState @{ supervisorStatus = 'healthy'; lastError = $null }
  } catch {
    Write-SupervisorState @{ supervisorStatus = 'error'; lastError = $_.Exception.Message }
    throw
  }
}

Write-Host 'Job Harness Recruitment Browser Supervisor'
Write-Host "Root: $root"
Write-Host "Runtime channel: $RuntimeBaseUrl"

if ($Once) {
  Run-SupervisorIteration
  exit 0
}

while ($true) {
  try {
    Run-SupervisorIteration
  } catch {
    Write-Warning $_.Exception.Message
  }
  Start-Sleep -Seconds ([Math]::Max(10, $PollSeconds))
}
