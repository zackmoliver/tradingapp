# Trading App Preflight Check Script
# Run this before development to ensure everything is properly configured

Write-Host "🚀 Trading App Preflight Check" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$errors = 0
$warnings = 0

# Function to check and report
function Check-Item {
    param($Name, $ScriptBlock, $IsWarning = $false)
    
    Write-Host "Checking $Name..." -NoNewline
    
    try {
        $result = & $ScriptBlock
        if ($result) {
            Write-Host " ✅" -ForegroundColor Green
            return $true
        } else {
            if ($IsWarning) {
                Write-Host " ⚠️" -ForegroundColor Yellow
                $script:warnings++
            } else {
                Write-Host " ❌" -ForegroundColor Red
                $script:errors++
            }
            return $false
        }
    } catch {
        if ($IsWarning) {
            Write-Host " ⚠️ ($($_.Exception.Message))" -ForegroundColor Yellow
            $script:warnings++
        } else {
            Write-Host " ❌ ($($_.Exception.Message))" -ForegroundColor Red
            $script:errors++
        }
        return $false
    }
}

# 1. JSON Validation
Check-Item "package.json validity" {
    $null = [System.IO.File]::ReadAllText("package.json") | ConvertFrom-Json
    return $true
}

Check-Item "tauri.conf.json validity" {
    $null = [System.IO.File]::ReadAllText("src-tauri/tauri.conf.json") | ConvertFrom-Json
    return $true
}

# 2. Port 8080 Configuration
Check-Item "package.json port 8080" {
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    return $pkg.scripts.dev -match "--port 8080"
}

Check-Item "tauri.conf.json port 8080" {
    $conf = Get-Content "src-tauri/tauri.conf.json" | ConvertFrom-Json
    return $conf.build.devUrl -eq "http://localhost:8080"
}

# 3. Port Availability
Check-Item "port 8080 availability" {
    $connection = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Host ""
        Write-Host "  Port 8080 is occupied. Attempting to free..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $connection.OwningProcess -Force
            Start-Sleep -Seconds 1
            $connection = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
            return $null -eq $connection
        } catch {
            return $false
        }
    }
    return $true
}

# 4. TypeScript Check
Check-Item "TypeScript compilation" {
    $output = npx tsc --noEmit 2>&1
    return $LASTEXITCODE -eq 0
}

# 5. Rust Check
Check-Item "Rust compilation" {
    Push-Location "src-tauri"
    $output = cargo check 2>&1
    $success = $LASTEXITCODE -eq 0
    Pop-Location
    return $success
}

# 6. ESLint Check
Check-Item "ESLint validation" {
    $output = npx eslint src --ext .ts,.tsx --max-warnings 0 2>&1
    return $LASTEXITCODE -eq 0
} $true  # Make this a warning, not an error

# 7. Dependency Check
Check-Item "Node modules installed" {
    return Test-Path "node_modules"
}

Check-Item "Tauri CLI available" {
    $output = npx @tauri-apps/cli@latest --version 2>&1
    return $LASTEXITCODE -eq 0
}

# 8. File Structure Check
Check-Item "centralized tauri.ts exists" {
    return Test-Path "src/lib/tauri.ts"
}

Check-Item "centralized date.ts exists" {
    return Test-Path "src/lib/date.ts"
}

Check-Item "main.tsx exists" {
    return Test-Path "src/main.tsx"
}

# 9. Import Validation
Check-Item "no forbidden @tauri-apps/api/tauri imports" {
    $files = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx"
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw
        if ($content -match '@tauri-apps/api/tauri') {
            Write-Host ""
            Write-Host "  Found forbidden import in: $($file.Name)" -ForegroundColor Red
            return $false
        }
    }
    return $true
}

# Summary
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "🎉 All checks passed! Ready to launch." -ForegroundColor Green
    Write-Host ""
    Write-Host "To start development:" -ForegroundColor Cyan
    Write-Host "  npx @tauri-apps/cli@latest dev" -ForegroundColor White
} elseif ($errors -eq 0) {
    Write-Host "⚠️  $warnings warning(s) found, but ready to launch." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To start development:" -ForegroundColor Cyan
    Write-Host "  npx @tauri-apps/cli@latest dev" -ForegroundColor White
} else {
    Write-Host "❌ $errors error(s) and $warnings warning(s) found." -ForegroundColor Red
    Write-Host "Please fix the errors before launching." -ForegroundColor Red
    Write-Host ""
    Write-Host "See RUNBOOK.md for troubleshooting guidance." -ForegroundColor Cyan
    exit 1
}

Write-Host ""
