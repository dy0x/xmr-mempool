"use strict";
/**
 * XMR Mempool — Express + WebSocket server
 *
 * WebSocket protocol (mirrors mempool.space):
 *   Client → Server:  { action: "want", data: ["blocks","mempool-blocks","stats"] }
 *   Server → Client:  { type: "init", payload: <MempoolState> }
 *                     { type: "mempool-blocks", payload: MempoolBlock[] }
 *                     { type: "stats", payload: { mempoolInfo, fees, networkStats } }
 *                     { type: "blocks", payload: RecentBlock[] }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const routes_js_1 = __importDefault(require("./routes.js"));
const mempool_manager_js_1 = require("./mempool-manager.js");
const PORT = parseInt(process.env.PORT || '3001', 10);
const app = (0, express_1.default)();
// ── Middleware ────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ── REST API ──────────────────────────────────────────────────────────────────
app.use('/api/v1', routes_js_1.default);
// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
// ── WebSocket ─────────────────────────────────────────────────────────────────
const httpServer = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server: httpServer });
const clients = new Map();
function send(ws, type, payload) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
    }
}
function broadcastStateUpdate(state) {
    for (const [ws, clientState] of clients.entries()) {
        if (ws.readyState !== ws_1.WebSocket.OPEN)
            continue;
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
        if (clientState.subscriptions.has('blocks')) {
            send(ws, 'blocks', state.recentBlocks.slice(0, 8));
        }
    }
}
// Subscribe to mempool updates
mempool_manager_js_1.mempoolManager.onStateChange(broadcastStateUpdate);
wss.on('connection', (ws) => {
    const clientState = { subscriptions: new Set(), alive: true };
    clients.set(ws, clientState);
    console.log(`[ws] client connected (total: ${clients.size})`);
    // Send current state immediately
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (state) {
        send(ws, 'init', {
            blocks: state.recentBlocks.slice(0, 8),
            mempoolInfo: state.info,
            mempoolBlocks: state.mempoolBlocks,
            fees: state.fees,
            networkStats: state.networkStats,
        });
    }
    else {
        send(ws, 'loading', { message: 'Connecting to Monero node…' });
    }
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.action === 'want' && Array.isArray(msg.data)) {
                for (const sub of msg.data)
                    clientState.subscriptions.add(sub);
                // Immediately send current data for new subscriptions
                const s = mempool_manager_js_1.mempoolManager.getState();
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
        }
        catch {
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
}, 30000);
// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, async () => {
    console.log(`\n🔷 XMR Mempool backend running at http://localhost:${PORT}`);
    console.log(`   REST API: http://localhost:${PORT}/api/v1/init-data`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`\n   Connecting to Monero node…`);
    try {
        await mempool_manager_js_1.mempoolManager.start();
        console.log('   ✅ Monero node connected & polling started\n');
    }
    catch (err) {
        console.error('   ❌ Failed to connect to Monero node:', err);
        console.error('   Check MONERO_HOST / MONERO_RPC_PORT env vars\n');
    }
});
process.on('SIGTERM', () => {
    mempool_manager_js_1.mempoolManager.stop();
    httpServer.close();
});
//# sourceMappingURL=server.js.map