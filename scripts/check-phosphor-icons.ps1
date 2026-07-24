$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = Join-Path $repoRoot 'web\src'
$legacyImports = @()
foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object Extension -in '.ts', '.tsx') {
  $text = Get-Content -LiteralPath $file.FullName -Raw
  foreach ($match in [regex]::Matches($text, 'import\s*\{(?<symbols>[^;]*?)\}\s*from\s*"@phosphor-icons/react"', [Text.RegularExpressions.RegexOptions]::Singleline)) {
    foreach ($symbol in $match.Groups['symbols'].Value.Split(',')) {
      $sourceName = ($symbol.Trim() -split '\s+as\s+')[0].Trim()
      if ($sourceName -and -not $sourceName.EndsWith('Icon')) {
        $legacyImports += "${file.FullName}: $sourceName"
      }
    }
  }
}

if ($legacyImports.Count -gt 0) {
  $legacyImports | ForEach-Object { Write-Error "Legacy Phosphor icon import detected: $_" }
  exit 1
}

exit 0
