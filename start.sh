#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# XMR Mempool — start script
# Starts both backend (port 3001) and frontend dev server (port 4200)
# ════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🔷 XMR Mempool — Monero Explorer"
echo "══════════════════════════════════"

# ── Backend ──────────────────────────────────────────────────────────────────

echo ""
echo "▶ Starting backend..."

cd "$SCRIPT_DIR/backend"

if [ ! -d node_modules ]; then
  echo "  Installing backend dependencies..."
  npm install
fi

# Full-access RPC (port 18081 with credentials)
export MONERO_HOST="${MONERO_HOST:-192.168.0.12}"
export MONERO_RPC_PORT="${MONERO_RPC_PORT:-18081}"
export MONERO_RPC_USER="${MONERO_RPC_USER:-monero}"
export MONERO_RPC_PASS="${MONERO_RPC_PASS:-WsPs_7onqOlvSNlaHltNn7MkCNpVs7XIZKD8WKEgVp0=}"
export PORT="${PORT:-3001}"

npm run dev &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID (http://localhost:$PORT)"

# ── Frontend ──────────────────────────────────────────────────────────────────

echo ""
echo "▶ Starting frontend..."

cd "$SCRIPT_DIR/frontend"

if [ ! -d node_modules ]; then
  echo "  Installing frontend dependencies..."
  npm install
elif [ ! -f node_modules/@rollup/rollup-darwin-arm64/rollup.darwin-arm64.node ] && \
     [ "$(uname -m)" = "arm64" ]; then
  echo "  Fixing rollup for Apple Silicon (cleaning node_modules)..."
  rm -rf node_modules package-lock.json
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID (http://localhost:4200)"

# ── Wait ──────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════"
echo "✅ XMR Mempool running!"
echo "   Open: http://localhost:4200"
echo "══════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
