[CmdletBinding()]
param(
    [switch]$Install,
    [string]$DeviceSerial = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = $repositoryRoot
$androidRoot = Join-Path $tauriRoot "src-tauri\gen\android"
$gradleFile = Join-Path $androidRoot "app\build.gradle.kts"
$keystorePropertiesFile = Join-Path $androidRoot "keystore.properties"
$apkOutputDirectory = Join-Path $androidRoot "app\build\outputs\apk"

foreach ($requiredPath in @(
    (Join-Path $repositoryRoot "package.json"),
    (Join-Path $repositoryRoot "src-tauri\tauri.conf.json"),
    (Join-Path $repositoryRoot "src\main.tsx"),
    (Join-Path $repositoryRoot "public\favicon.png")
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

$configPath = Join-Path $tauriRoot "src-tauri\tauri.conf.json"
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$expectedVersionName = [string]$config.version
if ($expectedVersionName -notmatch '^(?<major>[0-9]+)\.(?<minor>[0-9]+)\.(?<patch>[0-9]+)$') {
    throw "tauri.conf.json version must be a semantic MAJOR.MINOR.PATCH version."
}
$major = [long]$Matches.major
$minor = [long]$Matches.minor
$patch = [long]$Matches.patch
if ($minor -ge 1000 -or $patch -ge 1000) {
    throw "Android semver minor and patch components must each be less than 1000 to produce a unique versionCode."
}
$derivedVersionCode = ($major * 1000000) + ($minor * 1000) + $patch
$androidConfig = $config.bundle.android
$hasExplicitVersionCode = $null -ne $androidConfig -and $androidConfig.PSObject.Properties.Name -contains "versionCode"
if ($hasExplicitVersionCode) {
    $expectedVersionCode = [long]$androidConfig.versionCode
} else {
    # Keep every automated release above the legacy 0.1.0 APK's versionCode 1001.
    $expectedVersionCode = $derivedVersionCode + 1
}
if ($expectedVersionCode -le 0 -or $expectedVersionCode -gt 2100000000) {
    throw "Android versionCode must be greater than zero and no greater than 2100000000."
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
$buildArguments = @("run", "tauri", "android", "build", "--apk")
if (-not $hasExplicitVersionCode) {
    $versionOverride = [ordered]@{
        bundle = [ordered]@{
            android = [ordered]@{ versionCode = $expectedVersionCode }
        }
    } | ConvertTo-Json -Depth 4 -Compress
    $buildArguments += @("--config", $versionOverride)
}
Invoke-TauriBun -Arguments $buildArguments

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
$badgingText = $badging -join "`n"
$packageMatch = [regex]::Match($badgingText, "package:\s+name='(?<name>[^']+)'\s+versionCode='(?<versionCode>\d+)'\s+versionName='(?<versionName>[^']+)'")
if ($LASTEXITCODE -ne 0 -or -not $packageMatch.Success) {
    throw "The Android APK package metadata could not be read."
}
if ($packageMatch.Groups["name"].Value -ne "com.cavoti.bar") {
    throw "The Android APK package metadata is not com.cavoti.bar."
}
if ([long]$packageMatch.Groups["versionCode"].Value -ne $expectedVersionCode) {
    throw "The Android APK versionCode does not match the configured version code $expectedVersionCode."
}
if ($packageMatch.Groups["versionName"].Value -ne $expectedVersionName) {
    throw "The Android APK versionName does not match tauri.conf.json version $expectedVersionName."
}
$brandedApk = Join-Path $apk.DirectoryName "Cavoti Bar.apk"
Copy-Item -LiteralPath $apk.FullName -Destination $brandedApk -Force
$apk = Get-Item -LiteralPath $brandedApk

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
