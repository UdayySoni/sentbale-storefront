$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$portableNode = Join-Path $PSScriptRoot '.tools/node-v22.23.1-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) {
  $env:PATH = "$portableNode;$env:PATH"
}
$projectTemp = Join-Path $PSScriptRoot '.tools/tmp'
New-Item -ItemType Directory -Force -Path $projectTemp | Out-Null
$env:TEMP = $projectTemp
$env:TMP = $projectTemp
$env:NEXT_TELEMETRY_DISABLED = '1'

# Local PostgreSQL (portable binaries in .tools, data in data/postgres, port 5433).
# The connection string lives in .env.local, which Next.js loads automatically.
$pgBin = Join-Path $PSScriptRoot '.tools/postgresql-18.6/bin'
$pgData = Join-Path $PSScriptRoot 'data/postgres'
if (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION')) {
  & (Join-Path $pgBin 'pg_isready.exe') -h localhost -p 5433 -q
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Starting PostgreSQL on port 5433...'
    # Detached, so the database keeps running independently of this window's output.
    Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList @('-D', "`"$pgData`"", '-W', 'start') -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      & (Join-Path $pgBin 'pg_isready.exe') -h localhost -p 5433 -q
      if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not start. See data/postgres/log for details.' }
  }
} elseif (-not $env:DATABASE_URL) {
  Write-Warning 'No local database in data/postgres and DATABASE_URL is not set; the store will not be able to load data.'
}

Write-Host 'Starting SENTBALE at http://127.0.0.1:3000'
Write-Host 'Keep this terminal open. Press Ctrl+C to stop. PostgreSQL keeps running; stop it with stop-db.ps1.'
& npm.cmd run dev
