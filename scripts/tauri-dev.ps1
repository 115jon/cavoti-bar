[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

Stop-CavotiProcesses
Invoke-TauriBun -Arguments @("run", "tauri", "dev")
