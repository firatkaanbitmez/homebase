# HomeBase Firewall Worker
# Watches firewall-queue.json and applies port rules to Windows Firewall.
# Run as Administrator: powershell -ExecutionPolicy Bypass -File firewall-worker.ps1
# Or install as scheduled task (see bottom of file).

param(
    [switch]$Install,
    [switch]$Uninstall
)

$QueuePath = Join-Path $PSScriptRoot "homebase\runtime\firewall-queue.json"
$LogPath   = Join-Path $PSScriptRoot "homebase\runtime\firewall-worker.log"

# ─── Scheduled Task Install/Uninstall ───
if ($Install) {
    $taskName = "HomeBase-FirewallWorker"
    $scriptPath = $MyInvocation.MyCommand.Path
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "HomeBase firewall port manager"
    Write-Host "Scheduled task '$taskName' installed. It will run at startup as SYSTEM."
    Write-Host "To start now: Start-ScheduledTask -TaskName '$taskName'"
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Started."
    exit
}

if ($Uninstall) {
    $taskName = "HomeBase-FirewallWorker"
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Scheduled task '$taskName' removed."
    } else {
        Write-Host "Task not found."
    }
    exit
}

# ─── Logging ───
function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    try {
        # Keep log file under 1MB
        if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 1MB) {
            $content = Get-Content $LogPath -Tail 500
            Set-Content $LogPath -Value $content
        }
        Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue
    } catch {}
}

# ─── Process Queue ───
function Process-Queue {
    if (-not (Test-Path $QueuePath)) { return $false }

    $raw = $null
    try {
        $raw = Get-Content $QueuePath -Raw -ErrorAction Stop
    } catch {
        return $false
    }

    if ([string]::IsNullOrWhiteSpace($raw)) { return $false }

    try {
        $data = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Log "WARN: Invalid JSON, clearing queue"
        '{"commands":[]}' | Set-Content $QueuePath -ErrorAction SilentlyContinue
        return $false
    }

    if (-not $data.commands -or $data.commands.Count -eq 0) { return $false }

    $count = $data.commands.Count
    $success = 0
    $errors = 0

    foreach ($cmd in $data.commands) {
        $port     = [int]$cmd.port
        $action   = $cmd.action
        $protocol = if ($cmd.protocol) { $cmd.protocol.ToUpper() } else { "TCP" }
        $ruleName = "SVC-$port"

        if ($port -lt 1 -or $port -gt 65535) {
            Write-Log "SKIP: Invalid port $port"
            continue
        }

        try {
            if ($action -eq "open") {
                # Get ALL rules with this name (handle duplicates)
                $existing = @(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)
                if ($existing.Count -gt 1) {
                    # Clean up duplicates — remove all, then create one
                    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
                    $existing = @()
                    Write-Log "CLEANUP: removed duplicate rules for $ruleName"
                }
                if ($existing.Count -eq 1) {
                    if ($existing[0].Enabled -ne 'True') {
                        Set-NetFirewallRule -DisplayName $ruleName -Enabled True -ErrorAction Stop
                        Write-Log "ENABLED: $ruleName ($protocol/$port)"
                    }
                } else {
                    New-NetFirewallRule `
                        -DisplayName $ruleName `
                        -Direction Inbound `
                        -Action Allow `
                        -Protocol $protocol `
                        -LocalPort $port `
                        -Enabled True `
                        -Profile Any `
                        -ErrorAction Stop | Out-Null
                    Write-Log "OPENED: $ruleName ($protocol/$port)"
                }
                $success++
            }
            elseif ($action -eq "close") {
                $existing = @(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)
                if ($existing.Count -gt 0) {
                    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
                    Write-Log "CLOSED: $ruleName ($protocol/$port)"
                    $success++
                }
            }
        } catch {
            $errors++
            Write-Log "ERROR: $action $ruleName - $($_.Exception.Message)"
        }
    }

    # Clear queue after processing
    '{"commands":[]}' | Set-Content $QueuePath -ErrorAction SilentlyContinue

    if ($success -gt 0 -or $errors -gt 0) {
        Write-Log "DONE: $count commands ($success ok, $errors errors)"
    }

    return ($count -gt 0)
}

# ─── Main ───
Write-Log "=========================================="
Write-Log "HomeBase Firewall Worker started"
Write-Log "Queue: $QueuePath"
Write-Log "=========================================="

# Process immediately on start
Process-Queue | Out-Null

# Watch loop with FileSystemWatcher
try {
    $dir  = Split-Path $QueuePath
    $file = Split-Path $QueuePath -Leaf

    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Ensure queue file exists
    if (-not (Test-Path $QueuePath)) {
        '{"commands":[]}' | Set-Content $QueuePath
    }

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $dir
    $watcher.Filter = $file
    $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::Size
    $watcher.EnableRaisingEvents = $true

    Write-Log "Watching for changes..."

    $lastProcessed = [DateTime]::MinValue
    $debounceMs = 1500  # Wait 1.5s after last change before processing

    while ($true) {
        $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed, 30000)
        if (-not $result.TimedOut) {
            # Debounce: wait for writes to settle (Windows fires multiple events per write)
            $now = Get-Date
            if (($now - $lastProcessed).TotalMilliseconds -lt $debounceMs) {
                continue  # Skip duplicate event
            }
            Start-Sleep -Milliseconds $debounceMs
            $lastProcessed = Get-Date
            Process-Queue | Out-Null
        }
        # Periodic check every 30s even without file change (safety net)
        else {
            Process-Queue | Out-Null
        }
    }
} catch {
    Write-Log "FATAL: $($_.Exception.Message)"
    # Wait and exit — scheduled task will restart
    Start-Sleep -Seconds 10
    exit 1
} finally {
    if ($watcher) { $watcher.Dispose() }
    Write-Log "Worker stopped"
}
