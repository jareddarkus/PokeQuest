# Publishes the realtime server (server/ folder) to Cloudflare. Run once you are logged in:  cd server; npx wrangler login
# Run from the repo root:  powershell -File scripts\deploy-server.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = if (Test-Path "$root\web\.env.local") { "$root\web\.env.local" } else { "$root\web\.env" }
$envFile = Get-Content $envPath
$url = ($envFile | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -replace '^VITE_SUPABASE_URL=', ''
$key = ($envFile | Where-Object { $_ -match '^VITE_SUPABASE_PUBLISHABLE_KEY=' }) -replace '^VITE_SUPABASE_PUBLISHABLE_KEY=', ''
if (-not $url -or -not $key) { throw "web\.env.local (or web\.env) must have VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY" }
Push-Location "$root\server"
npm install --legacy-peer-deps
npx wrangler deploy --var "SUPABASE_URL:$url" --var "SUPABASE_PUBLISHABLE_KEY:$key"
Pop-Location
