# 1-Minute Preflight Check for Trading App
# Run this before development to catch common issues

Write-Host "🔧 Trading App Preflight Check" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# JSON validation
Write-Host "`n📋 Validating JSON files..." -ForegroundColor Yellow
try {
    node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('✅ package.json ok')"
} catch {
    Write-Host "❌ package.json invalid" -ForegroundColor Red
    exit 1
}

try {
    node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('✅ tauri.conf.json ok')"
} catch {
    Write-Host "❌ tauri.conf.json invalid" -ForegroundColor Red
    exit 1
}

# TypeScript check
Write-Host "`n🔍 TypeScript check..." -ForegroundColor Yellow
$tscResult = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ TypeScript compilation ok" -ForegroundColor Green
} else {
    Write-Host "❌ TypeScript errors:" -ForegroundColor Red
    Write-Host $tscResult -ForegroundColor Red
    exit 1
}

# Rust check
Write-Host "`n🦀 Rust check..." -ForegroundColor Yellow
Push-Location src-tauri
$cargoResult = cargo check 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Rust compilation ok" -ForegroundColor Green
} else {
    Write-Host "❌ Rust errors:" -ForegroundColor Red
    Write-Host $cargoResult -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Port check and cleanup
Write-Host "`n🔌 Port cleanup..." -ForegroundColor Yellow
$p = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($p) {
    Write-Host "🧹 Freeing port 8080..." -ForegroundColor Yellow
    Stop-Process -Id $p.OwningProcess -Force
    Start-Sleep -Seconds 1
}
Write-Host "✅ Port 8080 available" -ForegroundColor Green

# Check for problematic imports
Write-Host "`n🚫 Checking for banned imports..." -ForegroundColor Yellow
$badImports = Select-String -Path "src/**/*.ts*" -Pattern "@tauri-apps/api/tauri" -Exclude "*.test.*" 2>$null
if ($badImports) {
    Write-Host "❌ Found banned @tauri-apps/api/tauri imports:" -ForegroundColor Red
    $badImports | ForEach-Object { Write-Host "  $($_.Filename):$($_.LineNumber)" -ForegroundColor Red }
    Write-Host "Use @tauri-apps/api/core and src/lib/tauri.ts instead" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ No banned imports found" -ForegroundColor Green
}

Write-Host "`n🎉 All checks passed! Ready to run:" -ForegroundColor Green
Write-Host "   npx @tauri-apps/cli@latest dev" -ForegroundColor Cyan
Write-Host "   or: npm run tauri:dev" -ForegroundColor Cyan
