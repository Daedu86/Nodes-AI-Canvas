param(
  [string]$TaskName = "Nodes AI Canvas Codex Runner"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Scheduled task '$TaskName' is not installed."
  exit 0
}

try {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
  # The task may already be stopped.
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed '$TaskName'. The Codex runner will no longer start automatically."
