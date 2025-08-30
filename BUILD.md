# Desktop Application Build Guide

This guide covers building the Trading Engine desktop application for distribution across Windows, macOS, and Linux platforms.

## Prerequisites

### Required Software

1. **Node.js** (v18 or later)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **Rust** (latest stable)
   - Install from [rustup.rs](https://rustup.rs/)
   - Verify: `rustc --version`

3. **Tauri CLI**
   - Auto-installed by build script
   - Manual install: `cargo install tauri-cli`

### Platform-Specific Dependencies

#### Windows
- **Microsoft Visual Studio Build Tools** or **Visual Studio Community**
- **Windows SDK** (usually included with VS)

#### macOS
- **Xcode Command Line Tools**: `xcode-select --install`
- **macOS SDK** (included with Xcode)

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
```

#### Linux (Fedora/RHEL)
```bash
sudo dnf install gtk3-devel webkit2gtk4.0-devel libappindicator-gtk3-devel librsvg2-devel patchelf
```

## Build Commands

### Quick Build
```bash
# Standard build (recommended)
npm run tauri:build

# Enhanced build with logging and artifact collection
npm run tauri:build:desktop

# Clean build (removes all cache)
npm run tauri:build:clean
```

### Manual Build Process
```bash
# 1. Install dependencies
npm ci

# 2. Build frontend
npm run build

# 3. Build desktop app
npm run tauri:build
```

## Build Outputs

### Windows
- **MSI Installer**: `src-tauri/target/release/bundle/msi/*.msi`
- **NSIS Installer**: `src-tauri/target/release/bundle/nsis/*.exe`

### macOS
- **DMG Image**: `src-tauri/target/release/bundle/dmg/*.dmg`
- **App Bundle**: `src-tauri/target/release/bundle/macos/*.app`

### Linux
- **Debian Package**: `src-tauri/target/release/bundle/deb/*.deb`
- **RPM Package**: `src-tauri/target/release/bundle/rpm/*.rpm`
- **AppImage**: `src-tauri/target/release/bundle/appimage/*.AppImage`

## GitHub Actions CI/CD

The repository includes automated builds via GitHub Actions:

### Workflow Features
- **Multi-platform builds** (Windows, macOS, Linux)
- **Dependency caching** for faster builds
- **Artifact collection** and upload
- **Automatic releases** on version tags

### Triggering Builds
- **Push to main/develop**: Builds all platforms
- **Pull requests**: Builds for validation
- **Version tags** (v*): Creates release with artifacts

### Setting Up Secrets (Optional)
For signed releases, add these repository secrets:
- `TAURI_PRIVATE_KEY`: Private key for app signing
- `TAURI_KEY_PASSWORD`: Password for private key

## Build Configuration

### Tauri Configuration
Edit `src-tauri/tauri.conf.json` to customize:
- App metadata (name, version, description)
- Bundle settings (identifier, icon, resources)
- Security policies and permissions
- Update server configuration

### Frontend Configuration
Edit `vite.config.ts` for frontend build settings:
- Build optimization
- Asset handling
- Development server configuration

## Troubleshooting

### Common Issues

#### Build Fails with "Command not found"
- Ensure all prerequisites are installed
- Restart terminal after installing Rust/Node.js
- Check PATH environment variable

#### Frontend Build Errors
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Rust Compilation Errors
```bash
# Update Rust toolchain
rustup update

# Clear Rust cache
cargo clean
```

#### Platform-Specific Issues

**Windows:**
- Install Visual Studio Build Tools if missing
- Ensure Windows SDK is available
- Run build in "Developer Command Prompt"

**macOS:**
- Install Xcode Command Line Tools
- Accept Xcode license: `sudo xcodebuild -license accept`
- Check macOS version compatibility

**Linux:**
- Install all required system dependencies
- Ensure GTK and WebKit development packages are installed
- Check for missing shared libraries

### Debug Mode
```bash
# Build with debug information
npm run tauri:build -- --debug

# Verbose output
RUST_LOG=debug npm run tauri:build
```

## Performance Optimization

### Build Speed
- Use `--parallel` flag for faster Rust compilation
- Enable incremental compilation in Cargo.toml
- Use SSD storage for build directory
- Increase available RAM for build process

### Bundle Size
- Enable frontend minification and tree-shaking
- Optimize images and assets
- Remove unused dependencies
- Use dynamic imports for code splitting

## Distribution

### Code Signing
- **Windows**: Use SignTool with certificate
- **macOS**: Use Apple Developer certificate
- **Linux**: GPG signing for packages

### App Stores
- **Microsoft Store**: Package as MSIX
- **Mac App Store**: Follow Apple guidelines
- **Linux**: Distribute via Snap, Flatpak, or AppImage

## Continuous Integration

The `.github/workflows/desktop.yml` workflow provides:
- Automated multi-platform builds
- Dependency caching for performance
- Artifact collection and storage
- Release automation on version tags
- Build status reporting

### Local Testing
```bash
# Test the build script locally
node scripts/build-desktop.js

# Check build artifacts
ls -la artifacts/

# Verify installers work
# (Install and test on target platforms)
```

## Support

For build issues:
1. Check this guide for common solutions
2. Review GitHub Actions logs for CI failures
3. Check Tauri documentation: [tauri.app](https://tauri.app)
4. Open an issue with build logs and system information
