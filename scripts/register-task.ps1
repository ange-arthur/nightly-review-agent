# Registers the nightly review as a Windows scheduled task (weekdays at 23:15 local time).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -Config C:\review\config.json
param(
  [Parameter(Mandatory = $true)][string]$Config,
  [string]$TaskName = "NightlyReviewAgent",
  [string]$Time = "23:15"
)
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "src\cli.ts --config `"$Config`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Task '$TaskName' registered: weekdays at $Time, config $Config"
