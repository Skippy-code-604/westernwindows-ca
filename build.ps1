# Build script for Firebase Hosting deployment
# Assembles the /public directory with:
#   - Static landing page files at root
#   - Next.js admin app static export at /admin/*

Write-Host "=== Building Western Windows for Firebase Hosting ===" -ForegroundColor Cyan

# Clean previous build
if (Test-Path "public") { Remove-Item -Recurse -Force "public" }

# 1. Build the Next.js admin app
Write-Host "`n[1/3] Building admin console..." -ForegroundColor Yellow
Push-Location app
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Admin app build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 2. Assemble the public directory
Write-Host "`n[2/3] Assembling public directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "public" -Force | Out-Null

# Copy the Next.js static export FIRST (provides /admin/*, /_next/*, etc.)
Copy-Item -Recurse "app/out/*" "public/" -Force

# Copy static landing page files ON TOP (so landing page index.html wins)
Copy-Item "index.html" "public/" -Force
Copy-Item "styles.css" "public/" -Force
Copy-Item "script.js" "public/" -Force
Copy-Item "logo.png" "public/" -Force
Copy-Item "nsccr-logo.png" "public/" -Force

Write-Host "`n[3/3] Build complete!" -ForegroundColor Green
Write-Host "Deploy with: firebase deploy --only hosting" -ForegroundColor Cyan
