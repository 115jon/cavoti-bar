[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

Stop-CavotiProcesses
Invoke-TauriBun -Arguments @("run", "tauri", "build", "--no-bundle")

$executable = Get-ReleaseExecutable
if (-not (Test-Path -LiteralPath $executable)) {
    throw "The release build succeeded but the executable was not found at $executable."
}

Write-Output $executable
