[CmdletBinding()]
param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

$executable = Get-ReleaseExecutable
if ($Build -or -not (Test-Path -LiteralPath $executable)) {
    & (Join-Path $PSScriptRoot "build-tauri-release.ps1")
}

if (-not (Test-Path -LiteralPath $executable)) {
    throw "The release executable was not found at $executable. Run with -Build."
}

Stop-CavotiProcesses
$startParameters = @{
    FilePath = $executable
    WorkingDirectory = Split-Path -Parent $executable
    PassThru = $true
}
$process = Start-Process @startParameters

Write-Output "Started Cavoti Bar release process $($process.Id)."
