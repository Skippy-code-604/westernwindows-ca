# Build script for Firebase Hosting deployment
# Assembles the /public directory with:
#   - Static landing page files at root
#   - Next.js admin app static export at /admin/*
#   - Portal app at /portal/* (from portal/ in this repo — ww-apps was folded in 2026-10-15)
#   - Window designer at /designer/* (React/Vite, from designer/ — the former Fenestration Pro, folded in 2026-10-16)
#
# This repo is the ONLY thing that deploys to the western-windows-ca project (hosting, functions, rules).

Write-Host "=== Building Western Windows for Firebase Hosting ===" -ForegroundColor Cyan

# Clean previous build
if (Test-Path "public") { Remove-Item -Recurse -Force "public" }

# 1. Build the Next.js admin app
Write-Host "`n[1/5] Building admin console..." -ForegroundColor Yellow
Push-Location app
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Admin app build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 2. Assemble the public directory
Write-Host "`n[2/5] Assembling public directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "public" -Force | Out-Null

# Copy the Next.js static export FIRST (provides /admin/*, /_next/*, etc.)
Copy-Item -Recurse "app/out/*" "public/" -Force

# Copy static landing page files ON TOP (so landing page index.html wins)
Copy-Item "index.html" "public/" -Force
Copy-Item "styles.css" "public/" -Force
Copy-Item "script.js" "public/" -Force
Copy-Item "logo.png" "public/" -Force
Copy-Item "nsccr-logo.png" "public/" -Force

# 3. Copy the Portal app (lives in this repo)
Write-Host "`n[3/5] Copying portal app..." -ForegroundColor Yellow
$portalSource = Join-Path $PSScriptRoot "portal"
if (-not (Test-Path "$portalSource\index.html")) {
    Write-Host "ERROR: Portal source not found at $portalSource — refusing to build a site without the portal." -ForegroundColor Red
    exit 1
}
New-Item -ItemType Directory -Path "public/portal" -Force | Out-Null
Copy-Item -Recurse "$portalSource\*" "public/portal/" -Force
Write-Host "  Portal files copied to public/portal/" -ForegroundColor Green

# 4. Build the Window Designer (the former Fenestration Pro configurator, React/Vite) into /designer
Write-Host "`n[4/5] Building window designer..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "designer")
if (-not (Test-Path "node_modules")) { npm ci --no-audit --no-fund }
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Designer build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
New-Item -ItemType Directory -Path "public/designer" -Force | Out-Null
Copy-Item -Recurse "designer/dist/*" "public/designer/" -Force
Write-Host "  Designer copied to public/designer/" -ForegroundColor Green

Write-Host "`n[5/5] Build complete!" -ForegroundColor Green
Write-Host "Deploy with: firebase deploy --only hosting" -ForegroundColor Cyan
