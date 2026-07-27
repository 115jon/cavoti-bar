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

function Import-CavotiEnv {
    $envPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    if (-not (Test-Path -LiteralPath $envPath)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }
        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
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
