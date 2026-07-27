[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "run-tauri-release.ps1") -Build
