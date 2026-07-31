[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[^/]+/[^/]+$')]
    [string]$Repository,
    [string]$Environment = "release"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tauri-process.ps1")
Import-CavotiEnv

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($null -eq $gh) { throw "GitHub CLI was not found on PATH." }
& $gh.Source auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not authenticated." }
& $gh.Source repo view $Repository | Out-Null
if ($LASTEXITCODE -ne 0) { throw "GitHub repository $Repository is not available." }

function Require-CavotiValue([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name is required." }
    return $value
}

function Set-CavotiGitHubSecret([string]$Name, [string]$Value) {
    $Value | & $gh.Source secret set $Name --env $Environment --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw "Failed to set GitHub Secret $Name." }
}

$keystorePath = [IO.Path]::GetFullPath((Require-CavotiValue "CAVOTI_ANDROID_KEYSTORE_FILE"))
if (-not (Test-Path -LiteralPath $keystorePath -PathType Leaf)) {
    throw "The Android signing keystore was not found."
}
$keystorePassword = Require-CavotiValue "CAVOTI_ANDROID_KEYSTORE_PASSWORD"
$keyPassword = [Environment]::GetEnvironmentVariable("CAVOTI_ANDROID_KEY_PASSWORD")
if ([string]::IsNullOrWhiteSpace($keyPassword)) { $keyPassword = $keystorePassword }
$signingPrivateKey = Require-CavotiValue "TAURI_SIGNING_PRIVATE_KEY"
$signingPrivateKeyPassword = [Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PASSWORD")

Set-CavotiGitHubSecret "TAURI_SIGNING_PRIVATE_KEY" $signingPrivateKey
if (-not [string]::IsNullOrWhiteSpace($signingPrivateKeyPassword)) {
    Set-CavotiGitHubSecret "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" $signingPrivateKeyPassword
} else {
    $existingSecrets = @(& $gh.Source secret list --repo $Repository --json name --jq '.[].name')
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect existing GitHub Secrets." }
    if ($existingSecrets -contains "TAURI_SIGNING_PRIVATE_KEY_PASSWORD") {
        & $gh.Source secret delete TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env $Environment --repo $Repository
        if ($LASTEXITCODE -ne 0) { throw "Failed to remove the stale GitHub signing password." }
    }
}
Set-CavotiGitHubSecret "CAVOTI_ANDROID_KEYSTORE_BASE64" ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath)))
Set-CavotiGitHubSecret "CAVOTI_ANDROID_KEY_ALIAS" (Require-CavotiValue "CAVOTI_ANDROID_KEY_ALIAS")
Set-CavotiGitHubSecret "CAVOTI_ANDROID_KEYSTORE_PASSWORD" $keystorePassword
Set-CavotiGitHubSecret "CAVOTI_ANDROID_KEY_PASSWORD" $keyPassword

$updateEndpoint = Require-CavotiValue "CAVOTI_UPDATE_ENDPOINT"
$updateEndpoint | & $gh.Source variable set CAVOTI_UPDATE_ENDPOINT --repo $Repository
if ($LASTEXITCODE -ne 0) { throw "Failed to set GitHub variable CAVOTI_UPDATE_ENDPOINT." }

Write-Output "Configured Cavoti Bar release secrets and variables for $Repository."
