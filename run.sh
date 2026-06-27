#!/bin/bash

# ============================================================
# te amo — Full Stack Launch Script
# Starts backend microservices (Docker) + Next.js frontend
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${CYAN}$1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Cleanup on exit
cleanup() {
  echo ""
  warn "Stopping all services..."
  docker-compose down --remove-orphans 2>/dev/null || true
  # Kill any Next.js dev server we launched
  if [ -n "$NEXT_PID" ]; then
    kill "$NEXT_PID" 2>/dev/null || true
  fi
  ok "All services stopped. Goodbye!"
  exit 0
}
trap cleanup SIGINT SIGTERM

# -----------------------------------------------------------
# 1. Kill any stale Next.js processes occupying port 3000
# -----------------------------------------------------------
log "🔍 Checking for stale processes on port 3000..."
STALE_PIDS=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "$STALE_PIDS" ]; then
  warn "Killing stale processes on port 3000: $STALE_PIDS"
  echo "$STALE_PIDS" | xargs kill -9 2>/dev/null || true
  sleep 1
  ok "Port 3000 cleared"
else
  ok "Port 3000 is free"
fi

# -----------------------------------------------------------
# 2. Start backend containers (build if changed)
# -----------------------------------------------------------
log "📦 Starting backend microservices (MongoDB, Redis, Gateway, Auth, Chat, Notifications)..."
docker-compose up --build -d
ok "Backend containers started"

# Wait for the gateway (port 5001) to become ready
log "⏳ Waiting for gateway to be ready on port 5001..."
MAX_WAIT=30
WAITED=0
until curl -s http://localhost:5001/health > /dev/null 2>&1 || [ $WAITED -ge $MAX_WAIT ]; do
  sleep 1
  WAITED=$((WAITED + 1))
  echo -n "."
done

if [ $WAITED -ge $MAX_WAIT ]; then
  # Not fatal — gateway might just not have /health endpoint
  warn "Gateway health check timed out, continuing anyway..."
else
  ok "Gateway is ready!"
fi

echo ""

# -----------------------------------------------------------
# 3. Install frontend deps if missing
# -----------------------------------------------------------
if [ ! -d "frontend/node_modules" ]; then
  log "📦 Installing frontend dependencies..."
  (cd frontend && npm install)
fi

# -----------------------------------------------------------
# 4. Start Next.js dev server
# -----------------------------------------------------------
log "🌐 Starting Next.js frontend..."
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  App:     http://localhost:3000${NC}"
echo -e "${GREEN}  API:     http://localhost:5001${NC}"
echo -e "${GREEN}  Press Ctrl+C to stop all services${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd frontend && npm run dev &
NEXT_PID=$!

# Wait for the Next.js dev server process
wait $NEXT_PID
