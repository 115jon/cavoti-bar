function Stop-CavotiProcesses {
    [CmdletBinding()]
    param(
        [int]$TimeoutSeconds = 5
    )

    $processes = @(Get-Process -Name "cavoti_bar" -ErrorAction SilentlyContinue)
    if ($processes.Count -eq 0) {
        return
    }

    $processes | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 100
        $remaining = @(Get-Process -Name "cavoti_bar" -ErrorAction SilentlyContinue)
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

    if ($remaining.Count -gt 0) {
        throw "Cavoti Bar is still running after $TimeoutSeconds seconds."
    }
}

function Get-TauriRoot {
    return Join-Path (Split-Path -Parent $PSScriptRoot) "apps\tauri"
}

function Get-ReleaseExecutable {
    return Join-Path (Get-TauriRoot) "src-tauri\target\release\cavoti_bar.exe"
}

function Invoke-TauriBun {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if ($null -eq $bun) {
        throw "Bun was not found on PATH."
    }

    Push-Location (Get-TauriRoot)
    try {
        & $bun.Source @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Bun command failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
