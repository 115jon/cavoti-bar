[CmdletBinding()]
param(
    [switch]$Install,
    [string]$DeviceSerial = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $repositoryRoot "apps\tauri"
$androidRoot = Join-Path $tauriRoot "src-tauri\gen\android"
$gradleFile = Join-Path $androidRoot "app\build.gradle.kts"
$keystorePropertiesFile = Join-Path $androidRoot "keystore.properties"
$apkOutputDirectory = Join-Path $androidRoot "app\build\outputs\apk"

foreach ($requiredPath in @(
    (Join-Path $repositoryRoot "apps\tauri\package.json"),
    (Join-Path $repositoryRoot "apps\tauri\src-tauri\tauri.conf.json"),
    (Join-Path $repositoryRoot "web\package.json")
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "The Cavoti Tauri repository structure is incomplete: $requiredPath"
    }
}

function Import-CavotiAndroidEnv {
    $envPath = Join-Path $repositoryRoot ".env"
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { return }
    $names = @(
        "CAVOTI_ANDROID_KEYSTORE_FILE",
        "CAVOTI_ANDROID_KEY_ALIAS",
        "CAVOTI_ANDROID_KEYSTORE_PASSWORD",
        "CAVOTI_ANDROID_KEY_PASSWORD",
        "ANDROID_DEVICE_SERIAL"
    )
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) { continue }
        $name = $parts[0].Trim()
        if ($names -notcontains $name) { continue }
        $value = $parts[1].Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

Import-CavotiAndroidEnv
if (-not $PSBoundParameters.ContainsKey("DeviceSerial")) {
    $DeviceSerial = $env:ANDROID_DEVICE_SERIAL
}

function Require-EnvironmentValue([string]$name) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$name is required. Keep the Android keystore outside the repository and configure this value in .env or the process environment."
    }
    return $value
}

function Escape-PropertiesValue([string]$value) {
    return $value.Replace("\", "\\").Replace(":", "\:").Replace("=", "\=")
}

function Get-AndroidTool([string]$name) {
    $sdkRoot = $env:ANDROID_HOME
    if ([string]::IsNullOrWhiteSpace($sdkRoot)) { $sdkRoot = $env:ANDROID_SDK_ROOT }
    if ([string]::IsNullOrWhiteSpace($sdkRoot)) { throw "ANDROID_HOME or ANDROID_SDK_ROOT is required." }
    $tools = @(Get-ChildItem -LiteralPath (Join-Path $sdkRoot "build-tools") -Recurse -Filter $name -File -ErrorAction SilentlyContinue | Sort-Object FullName)
    $tool = if ($tools.Count -gt 0) { $tools[$tools.Count - 1].FullName } else { $null }
    if ([string]::IsNullOrWhiteSpace($tool)) { throw "$name was not found under $sdkRoot\build-tools." }
    return $tool
}

$keystorePath = [Environment]::GetEnvironmentVariable("CAVOTI_ANDROID_KEYSTORE_FILE")
$keyAlias = Require-EnvironmentValue "CAVOTI_ANDROID_KEY_ALIAS"
$storePassword = Require-EnvironmentValue "CAVOTI_ANDROID_KEYSTORE_PASSWORD"
$keyPassword = [Environment]::GetEnvironmentVariable("CAVOTI_ANDROID_KEY_PASSWORD")
if ([string]::IsNullOrWhiteSpace($keyPassword)) { $keyPassword = $storePassword }

if ([string]::IsNullOrWhiteSpace($keystorePath)) {
    throw "CAVOTI_ANDROID_KEYSTORE_FILE is required and must point outside the repository."
}
$keystorePath = [IO.Path]::GetFullPath($keystorePath)
if ($keystorePath.StartsWith($repositoryRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "CAVOTI_ANDROID_KEYSTORE_FILE must point outside the repository."
}
if (-not (Test-Path -LiteralPath $keystorePath -PathType Leaf)) {
    throw "Android keystore was not found at $keystorePath."
}

if (-not (Test-Path -LiteralPath $androidRoot -PathType Container)) {
    Invoke-TauriBun -Arguments @("run", "tauri", "android", "init", "--ci")
}
if (-not (Test-Path -LiteralPath $gradleFile -PathType Leaf)) {
    throw "Generated Android Gradle project is missing $gradleFile."
}

$properties = @(
    "keyAlias=$(Escape-PropertiesValue $keyAlias)",
    "password=$(Escape-PropertiesValue $storePassword)",
    "keyPassword=$(Escape-PropertiesValue $keyPassword)",
    "storeFile=$(Escape-PropertiesValue ($keystorePath -replace '\\', '/'))"
)
$keystorePropertiesExisted = Test-Path -LiteralPath $keystorePropertiesFile -PathType Leaf
$keystorePropertiesBackup = if ($keystorePropertiesExisted) {
    [IO.File]::ReadAllBytes($keystorePropertiesFile)
} else {
    $null
}

try {
Set-Content -LiteralPath $keystorePropertiesFile -Value $properties -Encoding ascii
if (Test-Path -LiteralPath $apkOutputDirectory -PathType Container) {
    Remove-Item -LiteralPath $apkOutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $apkOutputDirectory -Force | Out-Null
Invoke-TauriBun -Arguments @("run", "tauri", "android", "build", "--apk")

$apks = @(Get-ChildItem -LiteralPath $apkOutputDirectory -Recurse -Filter "*.apk" -File |
    Where-Object { $_.Name -notmatch "unsigned" -and $_.FullName -match "release" } |
    Sort-Object LastWriteTime)
if ($apks.Count -ne 1) {
    throw "Expected exactly one signed Android release APK under gen\android\app\build\outputs\apk, found $($apks.Count)."
}
$apk = $apks[0]

$apksigner = Get-AndroidTool "apksigner.bat"
$aapt = Get-AndroidTool "aapt.exe"
$signatureOutput = & $apksigner verify --verbose --print-certs $apk.FullName 2>&1
if ($LASTEXITCODE -ne 0 -or ($signatureOutput -join "`n") -notmatch "Verified using v2 scheme \(APK Signature Scheme v2\): true") {
    throw "apksigner did not verify the APK with APK Signature Scheme v2."
}
$badging = & $aapt dump badging $apk.FullName
$config = Get-Content -Raw -LiteralPath (Join-Path $tauriRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$expectedVersionCode = [int]$config.bundle.android.versionCode
if ($expectedVersionCode -le 0) { throw "tauri.conf.json must define a positive Android versionCode." }
if ($LASTEXITCODE -ne 0 -or ($badging -join "`n") -notmatch "package: name='com\.cavoti\.bar' versionCode='$expectedVersionCode'") {
    throw "The Android APK package metadata is not com.cavoti.bar."
}

if ($Install) {
    if ([string]::IsNullOrWhiteSpace($DeviceSerial)) {
        throw "-Install requires -DeviceSerial or ANDROID_DEVICE_SERIAL."
    }
    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if ($null -eq $adb) { throw "adb was not found on PATH." }
    & $adb.Source -s $DeviceSerial get-state | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "ADB device $DeviceSerial is not available." }
    & $adb.Source -s $DeviceSerial install -r $apk.FullName
    if ($LASTEXITCODE -ne 0) { throw "APK installation failed on $DeviceSerial." }
}

Write-Output $apk.FullName
}
finally {
    if ($keystorePropertiesExisted) {
        [IO.File]::WriteAllBytes($keystorePropertiesFile, $keystorePropertiesBackup)
    } elseif (Test-Path -LiteralPath $keystorePropertiesFile -PathType Leaf) {
        Remove-Item -LiteralPath $keystorePropertiesFile -Force
    }
}
