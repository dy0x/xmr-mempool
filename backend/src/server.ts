/**
 * XMRLens — Express + WebSocket server
 *
 * WebSocket protocol (mirrors mempool.space):
 *   Client → Server:  { action: "want", data: ["blocks","mempool-blocks","stats"] }
 *   Server → Client:  { type: "init", payload: <MempoolState> }
 *                     { type: "mempool-blocks", payload: MempoolBlock[] }
 *                     { type: "stats", payload: { mempoolInfo, fees, networkStats } }
 *                     { type: "blocks", payload: RecentBlock[] }
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import apiRouter from './routes';
import { mempoolManager, MempoolState } from './mempool-manager';

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── REST API ──────────────────────────────────────────────────────────────────

app.use('/api/v1', apiRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── WebSocket ─────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/api/ws' });

interface ClientState {
  subscriptions: Set<string>;
  alive: boolean;
}

const clients = new Map<WebSocket, ClientState>();

let lastBroadcastTipHeight = -1;

function send(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastStateUpdate(state: MempoolState) {
  const tipHeight = state.recentBlocks[0]?.height ?? -1;
  const blockChanged = tipHeight !== lastBroadcastTipHeight;
  if (blockChanged) lastBroadcastTipHeight = tipHeight;

  for (const [ws, clientState] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    if (clientState.subscriptions.has('mempool-blocks')) {
      send(ws, 'mempool-blocks', state.mempoolBlocks);
    }
    if (clientState.subscriptions.has('stats')) {
      send(ws, 'stats', {
        mempoolInfo: state.info,
        fees: state.fees,
        networkStats: state.networkStats,
      });
    }
    if (blockChanged && clientState.subscriptions.has('blocks')) {
      send(ws, 'blocks', state.recentBlocks.slice(0, 60));
    }
  }
}

// Subscribe to mempool updates
mempoolManager.onStateChange(broadcastStateUpdate);

wss.on('connection', (ws: WebSocket) => {
  const clientState: ClientState = { subscriptions: new Set(), alive: true };
  clients.set(ws, clientState);

  console.log(`[ws] client connected (total: ${clients.size})`);

  // Send current state immediately
  const state = mempoolManager.getState();
  if (state) {
    send(ws, 'init', {
      blocks: state.recentBlocks.slice(0, 60),
      mempoolInfo: state.info,
      mempoolBlocks: state.mempoolBlocks,
      fees: state.fees,
      networkStats: state.networkStats,
    });
  } else {
    send(ws, 'loading', { message: 'Connecting to Monero node…' });
  }

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { action?: string; data?: string[] };
      if (msg.action === 'want' && Array.isArray(msg.data)) {
        for (const sub of msg.data) clientState.subscriptions.add(sub);
        // Immediately send current data for new subscriptions
        const s = mempoolManager.getState();
        if (s) {
          if (clientState.subscriptions.has('mempool-blocks')) {
            send(ws, 'mempool-blocks', s.mempoolBlocks);
          }
          if (clientState.subscriptions.has('stats')) {
            send(ws, 'stats', { mempoolInfo: s.info, fees: s.fees, networkStats: s.networkStats });
          }
          if (clientState.subscriptions.has('blocks')) {
            send(ws, 'blocks', s.recentBlocks.slice(0, 8));
          }
        }
      }
      if (msg.action === 'ping') {
        clientState.alive = true;
        send(ws, 'pong', {});
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('pong', () => { clientState.alive = true; });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (total: ${clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[ws] client error:', err.message);
    clients.delete(ws);
  });
});

// Keep-alive ping every 30 s
setInterval(() => {
  for (const [ws, clientState] of clients.entries()) {
    if (!clientState.alive) {
      ws.terminate();
      clients.delete(ws);
      continue;
    }
    clientState.alive = false;
    ws.ping();
  }
}, 30_000);

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, async () => {
  console.log(`\n🔷 XMRLens backend running at http://localhost:${PORT}`);
  console.log(`   REST API: http://localhost:${PORT}/api/v1/init-data`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`\n   Connecting to Monero node…`);

  try {
    await mempoolManager.start();
    console.log('   ✅ Monero node connected & polling started\n');
  } catch (err) {
    console.error('   ❌ Failed to connect to Monero node:', err);
    console.error('   Check MONERO_HOST / MONERO_RPC_PORT env vars\n');
  }
});

process.on('SIGTERM', () => {
  mempoolManager.stop();
  httpServer.close();
});
