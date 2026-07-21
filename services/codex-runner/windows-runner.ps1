param(
  [int]$RestartDelaySeconds = 3
)

$ErrorActionPreference = "Stop"
$RunnerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $RunnerDir ".env"
$ServerFile = Join-Path $RunnerDir "server.mjs"
$LogDir = Join-Path $RunnerDir ".logs"
$StdoutLog = Join-Path $LogDir "runner.stdout.log"
$StderrLog = Join-Path $LogDir "runner.stderr.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-RunnerAlive {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/healthz" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path $EnvFile)) {
  Add-Content -Path $StderrLog -Value "[$(Get-Date -Format o)] Missing .env at $EnvFile"
  exit 1
}

if (Test-RunnerAlive) {
  Add-Content -Path $StdoutLog -Value "[$(Get-Date -Format o)] Runner already active; supervisor exiting."
  exit 0
}

Set-Location $RunnerDir

# Start-Process flattens ArgumentList into a command line. Explicitly quote paths so
# installations under folders such as "SW Projects" are passed to Node intact.
$QuotedEnvArg = '"--env-file=' + $EnvFile.Replace('"', '\"') + '"'
$QuotedServerArg = '"' + $ServerFile.Replace('"', '\"') + '"'

while ($true) {
  try {
    Add-Content -Path $StdoutLog -Value "[$(Get-Date -Format o)] Starting Codex runner..."
    $process = Start-Process `
      -FilePath "node" `
      -ArgumentList @($QuotedEnvArg, $QuotedServerArg) `
      -WorkingDirectory $RunnerDir `
      -RedirectStandardOutput $StdoutLog `
      -RedirectStandardError $StderrLog `
      -PassThru `
      -WindowStyle Hidden

    $process.WaitForExit()
    Add-Content -Path $StderrLog -Value "[$(Get-Date -Format o)] Runner exited with code $($process.ExitCode). Restarting in $RestartDelaySeconds seconds."
  } catch {
    Add-Content -Path $StderrLog -Value "[$(Get-Date -Format o)] Failed to start runner: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $RestartDelaySeconds
}
