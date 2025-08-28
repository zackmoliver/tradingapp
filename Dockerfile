# Multi-stage Dockerfile for Options Trading Backtest Engine
# Supports Python 3.13, Node 20, Rust/Tauri, and Playwright

FROM ubuntu:22.04 as base

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libappindicator3-dev \
    librsvg2-dev \
    libayatana-appindicator3-dev \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Python 3.13
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y \
    python3.13 \
    python3.13-dev \
    python3.13-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.13 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1

# Install uv (modern Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install pnpm
RUN npm install -g pnpm

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

# Install Tauri CLI
RUN cargo install tauri-cli

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Copy package files first for better caching
COPY requirements.txt* pyproject.toml* ./
COPY package.json* pnpm-lock.yaml* ./
COPY rust-toolchain.toml* Cargo.toml* Cargo.lock* ./

# Install Python dependencies if they exist
RUN if [ -f requirements.txt ]; then uv pip install --system -r requirements.txt; fi
RUN if [ -f pyproject.toml ]; then uv pip install --system -e .; fi

# Install Node dependencies if they exist
RUN if [ -f package.json ]; then pnpm install; fi

# Install Playwright browsers
RUN if [ -f package.json ]; then pnpm exec playwright install; fi

# Install Rust dependencies if they exist
RUN if [ -f Cargo.toml ]; then cargo fetch; fi

# Copy the rest of the application
COPY . .

# Expose common ports
EXPOSE 3000 5173 8000 1420

# Default command
CMD ["/bin/bash"]
