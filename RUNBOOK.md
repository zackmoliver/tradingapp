# 🚀 Trading App - 1-Minute Runbook

## **QUICK HEALTH CHECK** (30 seconds)

### JSON Validation
```powershell
# Validate package.json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('✅ package.json ok')"

# Validate tauri.conf.json
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('✅ tauri.conf.json ok')"
```

### Type Checking
```powershell
# TypeScript check
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) { Write-Host "✅ TypeScript ok" -ForegroundColor Green } else { Write-Host "❌ TypeScript errors" -ForegroundColor Red }

# Rust check
cd src-tauri; cargo check; cd ..
if ($LASTEXITCODE -eq 0) { Write-Host "✅ Rust ok" -ForegroundColor Green } else { Write-Host "❌ Rust errors" -ForegroundColor Red }
```

### Port Management
```powershell
# Free port 8080 if occupied
$p=Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if($p){Stop-Process -Id $p.OwningProcess -Force; Write-Host "🔄 Port 8080 freed"}
```

## **LAUNCH** (30 seconds)

### Development Mode
```powershell
# Start development server
npx @tauri-apps/cli@latest dev
```

### Expected Results
- ✅ Vite serves on **http://localhost:8080**
- ✅ Tauri window opens automatically
- ✅ No Router nesting warnings in console
- ✅ Dates display as **MM/DD/YYYY** format
- ✅ Charts render without NaN ticks
- ✅ No `@tauri-apps/api/tauri` imports (ESLint enforced)

## **TROUBLESHOOTING** (if issues occur)

### Common Issues & Fixes

#### 1. Port 8080 Occupied
```powershell
npm run free:8080
# or manually:
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force
```

#### 2. TypeScript Errors
```powershell
# Check for centralized import violations
npx eslint src --ext .ts,.tsx --fix
```

#### 3. Rust Compilation Errors
```powershell
cd src-tauri
cargo clean
cargo check
cd ..
```

#### 4. Date Format Issues
- All dates must be MM/DD/YYYY
- Use `parseMMDDYYYY()` and `toMMDDYYYY()` from `src/lib/date.ts`
- Check chart data for NaN values

#### 5. Router Warnings
- Ensure only ONE `<HashRouter>` in `src/main.tsx`
- Use `<Routes>` and `<Route>` in `src/App.tsx` (no nested routers)

## **VALIDATION CHECKLIST**

### ✅ Configuration
- [ ] `package.json` valid JSON
- [ ] `src-tauri/tauri.conf.json` valid JSON
- [ ] Port 8080 configured in both files
- [ ] Tauri v2.4.0 in Cargo.toml

### ✅ Code Quality
- [ ] `npx tsc --noEmit` passes
- [ ] `cargo check` passes
- [ ] No `@tauri-apps/api/tauri` imports
- [ ] All `invoke` calls use `src/lib/tauri.ts`
- [ ] All date formatting uses `src/lib/date.ts`

### ✅ Runtime
- [ ] App launches on port 8080
- [ ] No console errors or warnings
- [ ] Dates display as MM/DD/YYYY
- [ ] Charts render without NaN ticks
- [ ] Navigation works without Router warnings

## **ARCHITECTURE OVERVIEW**

### File Structure
```
src/
├── lib/
│   ├── tauri.ts      # Centralized invoke wrapper
│   ├── date.ts       # MM/DD/YYYY date utilities
│   └── cache.ts      # Result caching system
├── components/       # Reusable UI components
├── pages/           # Route components
└── main.tsx         # Single HashRouter entry point

src-tauri/
├── src/main.rs      # Rust backend with MM/DD/YYYY dates
├── Cargo.toml       # Tauri v2.4.0 dependencies
└── tauri.conf.json  # Port 8080 configuration
```

### Key Principles
1. **Single Router**: Only `<HashRouter>` in main.tsx
2. **Centralized Imports**: All `invoke` calls through `src/lib/tauri.ts`
3. **Consistent Dates**: MM/DD/YYYY format everywhere
4. **No NaN Charts**: Filter invalid data before rendering
5. **ESLint Enforcement**: Prevent problematic imports

## **EMERGENCY RESET**

If all else fails:
```powershell
# Clean everything
npm run free:8080
cd src-tauri; cargo clean; cd ..
rm -rf node_modules dist
npm install
npx @tauri-apps/cli@latest dev
```

---

**🎯 Success Criteria**: App launches in <60 seconds with no errors, dates show as MM/DD/YYYY, charts render cleanly, and all type checks pass.
