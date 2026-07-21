param(
  [int]$RestartDelaySeconds = 3,
  [int]$RunnerPort = 8787,
  [int]$InspectPort = 4040
)

$ErrorActionPreference = "Stop"
$RunnerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $RunnerDir ".logs"
$StdoutLog = Join-Path $LogDir "ngrok.stdout.log"
$StderrLog = Join-Path $LogDir "ngrok.stderr.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-NgrokAlive {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$InspectPort/api/tunnels" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-NgrokAlive) {
  Add-Content -Path $StdoutLog -Value "[$(Get-Date -Format o)] ngrok already active; supervisor exiting."
  exit 0
}

while ($true) {
  try {
    Add-Content -Path $StdoutLog -Value "[$(Get-Date -Format o)] Starting ngrok tunnel to http://localhost:$RunnerPort..."
    $process = Start-Process `
      -FilePath "ngrok" `
      -ArgumentList @("http", $RunnerPort.ToString()) `
      -WorkingDirectory $RunnerDir `
      -RedirectStandardOutput $StdoutLog `
      -RedirectStandardError $StderrLog `
      -PassThru `
      -WindowStyle Hidden

    $process.WaitForExit()
    Add-Content -Path $StderrLog -Value "[$(Get-Date -Format o)] ngrok exited with code $($process.ExitCode). Restarting in $RestartDelaySeconds seconds."
  } catch {
    Add-Content -Path $StderrLog -Value "[$(Get-Date -Format o)] Failed to start ngrok: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $RestartDelaySeconds
}
