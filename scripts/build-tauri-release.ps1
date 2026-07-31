[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

Stop-CavotiProcesses
Invoke-TauriBun -Arguments @("run", "tauri", "build", "--no-bundle")

$rawExecutable = Get-RawReleaseExecutable
$executable = Get-ReleaseExecutable
if (-not (Test-Path -LiteralPath $rawExecutable)) {
    throw "The release build succeeded but the internal executable was not found at $rawExecutable."
}
Copy-Item -LiteralPath $rawExecutable -Destination $executable -Force
if (-not (Test-Path -LiteralPath $executable)) {
    throw "The release build succeeded but the executable was not found at $executable."
}

Write-Output $executable
