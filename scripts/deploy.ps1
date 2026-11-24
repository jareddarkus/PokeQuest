# Builds the website and publishes it to the gh-pages branch (GitHub Pages serves that branch).
# Run from the repo root:  powershell -File scripts\deploy.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$remote = git -C $root remote get-url origin
Push-Location "$root\web"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Pop-Location
$tmp = Join-Path $env:TEMP ("pokequest-deploy-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item "$root\web\dist\*" $tmp -Recurse
New-Item -ItemType File "$tmp\.nojekyll" | Out-Null
Push-Location $tmp
git init -q -b gh-pages
git add -A
git -c user.name="PokeQuest dev" -c user.email="dev@pokequest.invalid" commit -q -m "Deploy website"
git push -q -f $remote gh-pages
$pushed = $LASTEXITCODE
Pop-Location
if ($pushed -ne 0) { Remove-Item $tmp -Recurse -Force; throw "push failed" }
Remove-Item $tmp -Recurse -Force
Write-Host "Deployed. https://jareddarkus.github.io/PokeQuest/"
