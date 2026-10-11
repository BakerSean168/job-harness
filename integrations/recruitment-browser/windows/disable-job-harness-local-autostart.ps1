param(
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$knownLaunchers = @(
  'JobHarnessRecruitmentBrowser.cmd',
  'JobHarnessGetJobsRuntime.cmd'
)

foreach ($name in $knownLaunchers) {
  $path = Join-Path $startup $name
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "Not installed: $path"
    continue
  }

  if ($WhatIf) {
    Write-Host "Would remove: $path"
    continue
  }

  Remove-Item -Force -LiteralPath $path
  Write-Host "Removed: $path"
}

$matchingTasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
  $_.TaskName -match 'JobHarness|BossCopilot|RecruitmentBrowser|GetJobsRuntime'
}

if ($matchingTasks) {
  Write-Warning 'Matching Windows Scheduled Tasks exist. Job Harness does not install these as part of the supported local-runtime flow; review them manually before removal:'
  $matchingTasks | Select-Object TaskPath, TaskName, State | Format-Table -AutoSize
} else {
  Write-Host 'No matching Job Harness/BOSS recruitment Scheduled Tasks found.'
}

Write-Host 'Local Job Harness runtimes are now manual-start only unless an explicit auto-start mechanism exists elsewhere.'
