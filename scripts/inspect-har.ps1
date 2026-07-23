param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$har = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
$apiEntries = @($har.log.entries | Where-Object { $_.request.url -match '^https://cavoti.com/api/v1/' })

Write-Output "Cavoti API endpoints ($($apiEntries.Count) captured requests)"
$apiEntries | ForEach-Object {
  $uri = [Uri]$_.request.url
  $hasRequestCookie = @($_.request.cookies).Count -gt 0
  $hasAuthHeader = @($_.request.headers | Where-Object { $_.name -ieq 'authorization' }).Count -gt 0
  [PSCustomObject]@{
    Method = $_.request.method
    Status = $_.response.status
    Endpoint = $uri.AbsolutePath
    Query = $uri.Query.TrimStart('?')
    RequestCookie = $hasRequestCookie
    Authorization = $hasAuthHeader
  }
} | Sort-Object Endpoint, Query -Unique | Format-Table -AutoSize
