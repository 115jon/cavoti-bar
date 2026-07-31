[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")
$env:CI = "true"
Import-CavotiEnv

if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY) -and
    [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    throw "Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH before building updater artifacts."
}

if (-not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PATH) -and
    [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
    $privateKeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
    if (-not (Test-Path -LiteralPath $privateKeyPath)) {
        throw "TAURI_SIGNING_PRIVATE_KEY_PATH does not exist: $privateKeyPath"
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $privateKeyPath
}

Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue

if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}

Stop-CavotiProcesses
Invoke-TauriBun -Arguments @("run", "tauri", "build", "--no-bundle")

$tauriRoot = Get-TauriRoot
$releaseDirectory = Join-Path $tauriRoot "src-tauri\target\release"
$payloadDirectory = Join-Path $releaseDirectory "installer_stage"
$payloadZip = Join-Path $tauriRoot "installer\Assets\payload.zip"
$payloadZipDirectory = Split-Path -Parent $payloadZip
$installerProject = Join-Path $tauriRoot "installer\CavotiBarSetup.csproj"
$installerOutput = Join-Path $tauriRoot "installer\bin\Release\net48\Cavoti Bar Setup.exe"
$rawExecutable = Get-RawReleaseExecutable
$brandedExecutableName = Split-Path -Leaf (Get-ReleaseExecutable)

if (Test-Path -LiteralPath $payloadDirectory) { Remove-Item -LiteralPath $payloadDirectory -Recurse -Force }
New-Item -ItemType Directory -Path $payloadDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $payloadZipDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $rawExecutable)) {
    throw "The Tauri release executable was not found at $rawExecutable."
}
Copy-Item -LiteralPath $rawExecutable -Destination (Join-Path $payloadDirectory $brandedExecutableName) -Force
if (Test-Path -LiteralPath $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
Compress-Archive -Path (Join-Path $payloadDirectory "*") -DestinationPath $payloadZip -Force

$config = Get-Content -Raw -LiteralPath (Join-Path $tauriRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$version = $config.version
Push-Location (Split-Path -Parent $installerProject)
try {
    & dotnet build $installerProject -c Release -p:Version=$version -p:InformationalVersion=$version -p:Company=115jon -p:Product="Cavoti Bar Setup"
    if ($LASTEXITCODE -ne 0) { throw "Custom installer build failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $installerOutput)) {
    throw "The custom installer build succeeded but the executable was not found at $installerOutput."
}

$signature = "$installerOutput.sig"
if (-not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
    $signArguments = @("run", "tauri", "signer", "sign", $installerOutput)
    Invoke-TauriBun -Arguments $signArguments
    if (Test-Path -LiteralPath "$installerOutput.sig") { $signature = "$installerOutput.sig" }
}

Write-Output $installerOutput
if (Test-Path -LiteralPath $signature) { Write-Output $signature }
