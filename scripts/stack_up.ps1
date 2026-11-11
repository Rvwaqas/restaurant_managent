# PowerShell script to bring up the full local POS stack on a scratch database
param(
    [switch]$Demo,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [string]$FailPrinters = "",
    [string]$WriteStackJson = "",
    [string]$ScratchDb = "",
    [string]$PidsFile = "",
    [int]$TimeoutSec = 45
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$RunDir = Join-Path $ProjectRoot "run"
$ScratchDir = Join-Path $RunDir "scratch"
$LogsDir = Join-Path $RunDir "logs"
$DefaultPidsFile = Join-Path $RunDir "stack.pids"
$ActivePidsFile = if ($PidsFile) { $PidsFile } else { $DefaultPidsFile }
$DefaultScratchDb = Join-Path $ScratchDir "scratch_pos.db"
$ActiveScratchDb = if ($ScratchDb) { $ScratchDb } else { $DefaultScratchDb }

# 1. Clean existing stack if running
if (Test-Path $ActivePidsFile) {
    Write-Host "[STACK] Existing pids file found. Stopping previous stack first..."
    & "$PSScriptRoot\stack_down.ps1" -PidsFile $ActivePidsFile -Ports @($BackendPort, $FrontendPort)
}

# Ensure directories exist
New-Item -ItemType Directory -Force -Path (Split-Path $ActiveScratchDb -Parent) | Out-Null
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "data\print_sim") | Out-Null

# Clean stale server lock files
$staleLocks = @(
    (Join-Path $ProjectRoot "data\server.lock"),
    (Join-Path $ProjectRoot "backend\data\server.lock")
)
foreach ($l in $staleLocks) {
    if (Test-Path $l) {
        Remove-Item -Force $l -ErrorAction SilentlyContinue
    }
}

# Remove old scratch DB
if (Test-Path $ActiveScratchDb) {
    Remove-Item -Force $ActiveScratchDb -ErrorAction SilentlyContinue
}

$ScratchDbUri = "sqlite:///" + ($ActiveScratchDb.Replace('\', '/'))
Write-Host "[STACK] Using scratch database: $ScratchDbUri"

[System.Environment]::SetEnvironmentVariable("DATABASE_URL", $ScratchDbUri, "Process")
[System.Environment]::SetEnvironmentVariable("PRINT_MODE", "simulate", "Process")
[System.Environment]::SetEnvironmentVariable("PRINT_SIM_DIR", (Join-Path $ProjectRoot "data\print_sim"), "Process")
[System.Environment]::SetEnvironmentVariable("PYTHONPATH", (Join-Path $ProjectRoot "backend"), "Process")
[System.Environment]::SetEnvironmentVariable("AUTO_MIGRATE", "false", "Process")
[System.Environment]::SetEnvironmentVariable("NEXT_PUBLIC_API_URL", "http://localhost:$BackendPort/api", "Process")
[System.Environment]::SetEnvironmentVariable("NEXT_PUBLIC_USE_MOCK", "false", "Process")

# 2. Initialize scratch DB schema and seed master data
Write-Host "[STACK] Initializing database schema and master seed..."
$initProc = Start-Process -FilePath "python" -ArgumentList "scripts/init_scratch_db.py `"$ScratchDbUri`"" -WorkingDirectory $ProjectRoot -Wait -PassThru -NoNewWindow
if ($initProc.ExitCode -ne 0) {
    throw "[STACK] Database initialization failed with exit code $($initProc.ExitCode)"
}

if ($Demo) {
    Write-Host "[STACK] Seeding 90 days of demo history (--demo)..."
    $demoProc = Start-Process -FilePath "python" -ArgumentList "backend/scripts/seed.py --demo --days 90 --seed 42 --force-demo" -WorkingDirectory $ProjectRoot -Wait -PassThru -NoNewWindow
    if ($demoProc.ExitCode -ne 0) {
        throw "[STACK] Demo seeding failed with exit code $($demoProc.ExitCode)"
    }
}

# 3. Start backend and frontend detached
Write-Host "[STACK] Starting detached backend (port $BackendPort) and frontend (port $FrontendPort)..."
$startArgs = @(
    "scripts/start_stack.py",
    "--backend-port", "$BackendPort",
    "--frontend-port", "$FrontendPort",
    "--scratch-db", "$ActiveScratchDb",
    "--pids-file", "$ActivePidsFile"
)
if ($FailPrinters) {
    $startArgs += @("--fail-printers", "$FailPrinters")
}
if ($WriteStackJson) {
    $startArgs += @("--write-stack-json", "$WriteStackJson")
}

$startProc = Start-Process -FilePath "python" -ArgumentList $startArgs -WorkingDirectory $ProjectRoot -Wait -PassThru -NoNewWindow
if ($startProc.ExitCode -ne 0) {
    throw "[STACK] Failed to spawn stack processes"
}

# Wait briefly for file system to flush pids file
$pidsWaitCount = 0
while (-not (Test-Path $ActivePidsFile) -and $pidsWaitCount -lt 10) {
    Start-Sleep -Milliseconds 300
    $pidsWaitCount++
}

if (-not (Test-Path $ActivePidsFile)) {
    throw "[STACK] Pids file was not created at $ActivePidsFile"
}

$pidsData = Get-Content $ActivePidsFile | ConvertFrom-Json
$backendPid = $pidsData.backend
$frontendPid = $pidsData.frontend
Write-Host "[STACK] Recorded PIDs: Backend=$backendPid, Frontend=$frontendPid"

# 4. Wait for health checks
Write-Host "[STACK] Waiting for stack health (Timeout: ${TimeoutSec}s)..."
$startTime = Get-Date
$backendOk = $false
$frontendOk = $false

while ((Get-Date) - $startTime -lt (New-TimeSpan -Seconds $TimeoutSec)) {
    Start-Sleep -Seconds 2

    if (-not $backendOk) {
        try {
            $rawJson = (curl.exe -s --max-time 2 "http://127.0.0.1:$BackendPort/api/health")
            if ($rawJson -and ($rawJson -like "*`"status`"*" -or $rawJson -like "*`"db`"*")) {
                $backendOk = $true
                Write-Host "  [OK] Backend responding on http://127.0.0.1:$BackendPort/api/health"
            }
        } catch {}
    }

    if (-not $frontendOk) {
        try {
            $code = (curl.exe -s -o nul -w "%{http_code}" --max-time 2 "http://127.0.0.1:$FrontendPort/")
            if ($code -ge 200 -and $code -lt 400) {
                $frontendOk = $true
                Write-Host "  [OK] Frontend responding on http://127.0.0.1:$FrontendPort/ (HTTP $code)"
            }
        } catch {}
    }

    if ($backendOk -and $frontendOk) {
        break
    }
}

if (-not $backendOk -or -not $frontendOk) {
    Write-Host "[ERROR] Stack failed to become healthy within ${TimeoutSec}s."
    & "$PSScriptRoot\stack_down.ps1" -PidsFile $ActivePidsFile -Ports @($BackendPort, $FrontendPort)
    exit 1
}

Write-Host "`n========================================================"
Write-Host " POS STACK UP AND READY"
Write-Host " Backend:  http://127.0.0.1:$BackendPort/api (PID: $backendPid)"
Write-Host " Frontend: http://127.0.0.1:$FrontendPort     (PID: $frontendPid)"
Write-Host " Scratch:  $ActiveScratchDb"
Write-Host "========================================================`n"
