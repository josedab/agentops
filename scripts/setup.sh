#!/usr/bin/env bash
set -euo pipefail

# AgentOps Development Setup
# Copies .env.example files, installs dependencies, and optionally starts Docker infrastructure.

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BOLD}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✖${NC} $1"; }

copy_env() {
  local dir="$1"
  local name
  name=$(basename "$dir")
  if [ -f "$dir/.env.example" ] && [ ! -f "$dir/.env" ]; then
    cp "$dir/.env.example" "$dir/.env"
    ok "Created $dir/.env from .env.example"
  elif [ -f "$dir/.env" ]; then
    warn "$dir/.env already exists — skipping (delete it to regenerate)"
  fi
}

echo ""
echo -e "${BOLD}🚀 AgentOps Development Setup${NC}"
echo ""

# 1. Install dependencies
info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# 2. Copy .env.example files
info "Setting up environment files..."
copy_env "apps/web"
copy_env "apps/api"
copy_env "apps/ingest"

# 3. Docker infrastructure (optional)
if command -v docker &> /dev/null; then
  echo ""
  info "Starting Docker infrastructure (ClickHouse, PostgreSQL, Redis, Redpanda)..."
  if docker compose -f infrastructure/docker/docker-compose.yml up -d 2>/dev/null; then
    ok "Docker infrastructure started"
    info "Waiting for services to be healthy..."
    sleep 5
    docker compose -f infrastructure/docker/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || \
      docker compose -f infrastructure/docker/docker-compose.yml ps
  else
    warn "Docker infrastructure failed to start — you can start it later with: pnpm infra:up"
  fi
else
  warn "Docker not found — skip infrastructure setup. Install Docker and run: pnpm infra:up"
fi

# 4. Build packages
echo ""
info "Building packages..."
pnpm build
ok "Build complete"

echo ""
echo -e "${GREEN}${BOLD}✅ Setup complete!${NC}"
echo ""
echo "  Next steps:"
echo "    1. Review .env files in apps/web, apps/api, apps/ingest and add your API keys"
echo "    2. Run 'pnpm dev' to start development servers"
echo "    3. Open http://localhost:3000 for the dashboard"
echo ""
