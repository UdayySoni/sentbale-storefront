$ErrorActionPreference = 'Stop'
# Stops the local PostgreSQL that start-local.ps1 started.
& (Join-Path $PSScriptRoot '.tools/postgresql-18.6/bin/pg_ctl.exe') -D (Join-Path $PSScriptRoot 'data/postgres') -m fast stop
