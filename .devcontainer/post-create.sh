#!/bin/bash

# Post-create script for Options Trading Backtest Engine dev container

set -e

echo "🚀 Setting up development environment..."

# Ensure we're in the workspace directory
cd /workspace

# Install/update uv if not already available
if ! command -v uv &> /dev/null; then
    echo "📦 Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source ~/.bashrc
fi

# Install Python dependencies if pyproject.toml exists
if [ -f "pyproject.toml" ]; then
    echo "🐍 Installing Python dependencies with uv..."
    uv pip install --system -e .
elif [ -f "requirements.txt" ]; then
    echo "🐍 Installing Python dependencies from requirements.txt..."
    uv pip install --system -r requirements.txt
fi

# Install Node dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "📦 Installing Node.js dependencies with pnpm..."
    pnpm install
    
    # Install Playwright browsers
    echo "🎭 Installing Playwright browsers..."
    pnpm exec playwright install
fi

# Install Rust dependencies if Cargo.toml exists
if [ -f "Cargo.toml" ]; then
    echo "🦀 Fetching Rust dependencies..."
    cargo fetch
fi

# Set up git hooks if .git exists
if [ -d ".git" ]; then
    echo "🔧 Setting up git configuration..."
    git config --global --add safe.directory /workspace
fi

# Create common directories if they don't exist
mkdir -p tests engine signals schemas app/components app/state planning/presets

echo "✅ Development environment setup complete!"
echo ""
echo "🔧 Available commands:"
echo "  - uv run pytest -q          # Run Python tests"
echo "  - pnpm build                 # Build frontend"
echo "  - pnpm dev                   # Start dev server"
echo "  - cargo tauri dev            # Start Tauri app"
echo "  - pnpm test                  # Run Playwright tests"
echo ""
