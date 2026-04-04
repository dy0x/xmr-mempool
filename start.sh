#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# XMRLens — start script
# Starts both backend (port 3001) and frontend dev server (port 4200)
# ════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse flags ───────────────────────────────────────────────────────────────
HOST_FLAG=""
for arg in "$@"; do
  case $arg in
    --host) HOST_FLAG="--host" ;;
  esac
done

echo ""
echo "🔷 XMRLens — Monero Explorer"
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

npm run dev -- $HOST_FLAG &
FRONTEND_PID=$!
if [ -n "$HOST_FLAG" ]; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "your-local-ip")
  echo "  Frontend PID: $FRONTEND_PID"
  echo "  Local:   http://localhost:4200"
  echo "  Network: http://${LOCAL_IP}:4200"
else
  echo "  Frontend PID: $FRONTEND_PID (http://localhost:4200)"
fi

# ── Wait ──────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════"
echo "✅ XMRLens running!"
if [ -n "$HOST_FLAG" ]; then
  echo "   Local:   http://localhost:4200"
  echo "   Network: http://${LOCAL_IP}:4200"
else
  echo "   Open: http://localhost:4200"
fi
echo "══════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
