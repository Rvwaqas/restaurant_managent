# PowerShell script to cleanly tear down the POS stack
param(
    [string]$PidsFile = "",
    [int[]]$Ports = @(8000, 3000, 8100, 3100)
)

$ErrorActionPreference = "SilentlyContinue"

$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$RunDir = Join-Path $ProjectRoot "run"
$DefaultPidsFile = Join-Path $RunDir "stack.pids"
$ActivePidsFile = if ($PidsFile) { $PidsFile } else { $DefaultPidsFile }
$StackJsonFile = Join-Path $ProjectRoot "e2e-live\.stack.json"

Write-Host "[STACK] Stopping stack..."

# 1. Stop recorded PIDs from pids file
if (Test-Path $ActivePidsFile) {
    try {
        $pidsData = Get-Content $ActivePidsFile | ConvertFrom-Json
        if ($pidsData.backend) {
            Write-Host "  Stopping Backend PID $($pidsData.backend)..."
            Stop-Process -Id $pidsData.backend -Force -ErrorAction SilentlyContinue
        }
        if ($pidsData.frontend) {
            Write-Host "  Stopping Frontend PID $($pidsData.frontend)..."
            $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $pidsData.frontend }
            foreach ($child in $children) {
                Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
            }
            Stop-Process -Id $pidsData.frontend -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "  Warning reading pids file: $_"
    }
    Remove-Item -Force $ActivePidsFile -ErrorAction SilentlyContinue
}

# 2. Also check e2e-live/.stack.json if present
if (Test-Path $StackJsonFile) {
    try {
        $stackData = Get-Content $StackJsonFile | ConvertFrom-Json
        if ($stackData.backendPid) {
            Stop-Process -Id $stackData.backendPid -Force -ErrorAction SilentlyContinue
        }
        if ($stackData.frontendPid) {
            Stop-Process -Id $stackData.frontendPid -Force -ErrorAction SilentlyContinue
        }
    } catch {}
    Remove-Item -Force $StackJsonFile -ErrorAction SilentlyContinue
}

# 3. Terminate any listening process on specified ports
try {
    foreach ($port in $Ports) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            $portPids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($procId in $portPids) {
                if ($procId -gt 4) {
                    Write-Host "  Terminating process $procId listening on port $port..."
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
} catch {}

Start-Sleep -Seconds 1
Write-Host "[STACK] Teardown complete."
