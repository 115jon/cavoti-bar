[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot "CavotiBar.csproj"
$targetFramework = "net10.0-windows10.0.18362.0"
$executablePath = Join-Path $repoRoot "bin\$Configuration\$targetFramework\CavotiBar.exe"

$dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
if ($null -eq $dotnetCommand) {
    throw "The .NET SDK was not found on PATH."
}

$runningProcesses = @(Get-Process -Name "CavotiBar" -ErrorAction SilentlyContinue)
if ($runningProcesses.Count -gt 0) {
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Milliseconds 300
}

Push-Location $repoRoot
try {
    & $dotnetCommand.Source build $projectPath --configuration $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "Cavoti Bar build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $executablePath)) {
    throw "The build succeeded but the executable was not found at $executablePath."
}

Start-Process -FilePath $executablePath -WorkingDirectory (Split-Path -Parent $executablePath)
