param(
  [string]$TaskName = "Nodes AI Canvas Codex Runner"
)

$ErrorActionPreference = "Stop"
$RunnerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Supervisor = Join-Path $RunnerDir "windows-runner.ps1"
$EnvFile = Join-Path $RunnerDir ".env"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found in PATH. Install Node.js 22+ first."
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  throw "Codex CLI was not found in PATH. Install Codex CLI first."
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing $EnvFile. Create services/codex-runner/.env before installing autostart."
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedSupervisor = $Supervisor.Replace('"', '\"')
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$escapedSupervisor`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $RunnerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started '$TaskName'."
Write-Host "The Codex runner will now start automatically when you sign in to Windows."
Write-Host "Health: http://127.0.0.1:8787/healthz"
Write-Host "Logs:   $RunnerDir\.logs"
