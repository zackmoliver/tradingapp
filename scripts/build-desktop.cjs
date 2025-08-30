#!/usr/bin/env node

// This file uses CommonJS syntax for compatibility

/**
 * Desktop Build Script
 * 
 * Handles the complete desktop application build process with proper error handling,
 * progress reporting, and artifact management.
 * 
 * Features:
 * - Pre-build validation
 * - Frontend build with optimization
 * - Tauri desktop app compilation
 * - Artifact collection and reporting
 * - Cross-platform support
 * - Error handling and recovery
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const config = {
  buildDir: 'dist',
  tauriDir: 'src-tauri',
  artifactsDir: 'artifacts',
  logFile: 'build.log'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(`${color}${logMessage}${colors.reset}`);
  
  // Also write to log file
  fs.appendFileSync(config.logFile, logMessage + '\n');
}

function logError(message) {
  log(`❌ ERROR: ${message}`, colors.red);
}

function logSuccess(message) {
  log(`✅ SUCCESS: ${message}`, colors.green);
}

function logInfo(message) {
  log(`ℹ️  INFO: ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  WARNING: ${message}`, colors.yellow);
}

function runCommand(command, options = {}) {
  log(`Running: ${command}`, colors.cyan);
  try {
    const result = execSync(command, {
      stdio: 'inherit',
      encoding: 'utf8',
      ...options
    });
    return result;
  } catch (error) {
    logError(`Command failed: ${command}`);
    logError(`Exit code: ${error.status}`);
    throw error;
  }
}

function checkPrerequisites() {
  log('🔍 Checking prerequisites...', colors.bright);
  
  // Check Node.js
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    logInfo(`Node.js version: ${nodeVersion}`);
  } catch (error) {
    logError('Node.js is not installed or not in PATH');
    process.exit(1);
  }
  
  // Check npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    logInfo(`npm version: ${npmVersion}`);
  } catch (error) {
    logError('npm is not installed or not in PATH');
    process.exit(1);
  }
  
  // Check Rust
  try {
    const rustVersion = execSync('rustc --version', { encoding: 'utf8' }).trim();
    logInfo(`Rust version: ${rustVersion}`);
  } catch (error) {
    logError('Rust is not installed or not in PATH');
    logError('Please install Rust from https://rustup.rs/');
    process.exit(1);
  }
  
  logSuccess('All prerequisites are satisfied');
}

function cleanBuildArtifacts() {
  log('🧹 Cleaning previous build artifacts...', colors.bright);
  
  const dirsToClean = [config.buildDir, config.artifactsDir];
  
  dirsToClean.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      logInfo(`Cleaned ${dir}`);
    }
  });
  
  logSuccess('Build artifacts cleaned');
}

function installDependencies() {
  log('📦 Checking dependencies...', colors.bright);

  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    log('Installing dependencies...', colors.cyan);
    try {
      runCommand('npm install');
      logSuccess('Node.js dependencies installed');
    } catch (error) {
      logError('Failed to install Node.js dependencies');
      process.exit(1);
    }
  } else {
    logInfo('Dependencies already installed');
  }
}

function buildFrontend() {
  log('🏗️  Building frontend...', colors.bright);
  
  try {
    runCommand('npm run build');
    logSuccess('Frontend build completed');
    
    // Verify build output
    if (!fs.existsSync(config.buildDir)) {
      throw new Error('Frontend build directory not found');
    }
    
    const buildFiles = fs.readdirSync(config.buildDir);
    logInfo(`Frontend build contains ${buildFiles.length} files`);
    
  } catch (error) {
    logError('Frontend build failed');
    process.exit(1);
  }
}

function buildDesktopApp() {
  log('🖥️  Building desktop application...', colors.bright);
  
  try {
    runCommand('npm run tauri:build');
    logSuccess('Desktop application build completed');
    
  } catch (error) {
    logError('Desktop application build failed');
    logError('Make sure Tauri CLI is installed: cargo install tauri-cli');
    process.exit(1);
  }
}

function collectArtifacts() {
  log('📋 Collecting build artifacts...', colors.bright);
  
  // Create artifacts directory
  if (!fs.existsSync(config.artifactsDir)) {
    fs.mkdirSync(config.artifactsDir, { recursive: true });
  }
  
  const bundleDir = path.join(config.tauriDir, 'target', 'release', 'bundle');
  
  if (!fs.existsSync(bundleDir)) {
    logWarning('No bundle directory found');
    return;
  }
  
  const platform = os.platform();
  let artifactCount = 0;
  
  // Platform-specific artifact collection
  const platformPaths = {
    win32: ['msi', 'nsis'],
    darwin: ['dmg', 'macos'],
    linux: ['deb', 'rpm', 'appimage']
  };
  
  const paths = platformPaths[platform] || [];
  
  paths.forEach(bundleType => {
    const sourcePath = path.join(bundleDir, bundleType);
    if (fs.existsSync(sourcePath)) {
      const files = fs.readdirSync(sourcePath);
      files.forEach(file => {
        const sourceFile = path.join(sourcePath, file);
        const destFile = path.join(config.artifactsDir, file);
        fs.copyFileSync(sourceFile, destFile);
        logInfo(`Collected artifact: ${file}`);
        artifactCount++;
      });
    }
  });
  
  if (artifactCount === 0) {
    logWarning('No artifacts found to collect');
  } else {
    logSuccess(`Collected ${artifactCount} build artifacts`);
  }
}

function generateBuildReport() {
  log('📊 Generating build report...', colors.bright);
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const buildTime = new Date().toISOString();
  
  const report = {
    name: packageJson.name,
    version: packageJson.version,
    buildTime,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    artifacts: []
  };
  
  // List artifacts
  if (fs.existsSync(config.artifactsDir)) {
    const artifacts = fs.readdirSync(config.artifactsDir);
    report.artifacts = artifacts.map(file => {
      const filePath = path.join(config.artifactsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime
      };
    });
  }
  
  // Write report
  const reportPath = path.join(config.artifactsDir, 'build-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  logSuccess(`Build report generated: ${reportPath}`);
  logInfo(`Application: ${report.name} v${report.version}`);
  logInfo(`Platform: ${report.platform} (${report.arch})`);
  logInfo(`Artifacts: ${report.artifacts.length} files`);
}

function main() {
  const startTime = Date.now();
  
  log('🚀 Starting desktop application build...', colors.bright);
  
  try {
    // Initialize log file
    fs.writeFileSync(config.logFile, `Desktop Build Log - ${new Date().toISOString()}\n`);
    
    checkPrerequisites();
    cleanBuildArtifacts();
    installDependencies();
    buildFrontend();
    buildDesktopApp();
    collectArtifacts();
    generateBuildReport();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logSuccess(`🎉 Desktop application build completed in ${duration}s`);
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logError(`💥 Build failed after ${duration}s`);
    logError(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  checkPrerequisites,
  buildFrontend,
  buildDesktopApp,
  collectArtifacts
};
