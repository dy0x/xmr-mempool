"use strict";
/**
 * REST API routes — designed to be consumed by the React frontend.
 * All amounts are in piconero unless otherwise stated.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mempool_manager_js_1 = require("./mempool-manager.js");
const monero_rpc_js_1 = require("./monero-rpc.js");
const router = (0, express_1.Router)();
// ── Helper ────────────────────────────────────────────────────────────────────
function ok(res, data) {
    res.json(data);
}
function notFound(res, msg = 'Not found') {
    res.status(404).json({ error: msg });
}
function serverError(res, err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
}
// ── Network / Info ────────────────────────────────────────────────────────────
/** Full initial payload — what the frontend requests on first load */
router.get('/init-data', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    return ok(res, {
        blocks: state.recentBlocks.slice(0, 8),
        mempoolInfo: state.info,
        mempoolBlocks: state.mempoolBlocks,
        fees: state.fees,
        networkStats: state.networkStats,
        lastUpdated: state.lastUpdated,
    });
});
router.get('/network-info', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    return ok(res, state.networkStats);
});
// ── Mempool ───────────────────────────────────────────────────────────────────
router.get('/mempool', async (_req, res) => {
    try {
        const state = mempool_manager_js_1.mempoolManager.getState();
        return ok(res, state?.info ?? { count: 0, vsize: 0, totalFee: 0, memPoolMinFee: 0 });
    }
    catch (err) {
        return serverError(res, err);
    }
});
router.get('/mempool/txids', async (_req, res) => {
    try {
        const pool = await monero_rpc_js_1.moneroRPC.getTransactionPool();
        const txids = (pool.transactions ?? []).map((tx) => tx.id_hash);
        return ok(res, txids);
    }
    catch (err) {
        return serverError(res, err);
    }
});
router.get('/mempool/recent', async (_req, res) => {
    try {
        const pool = await monero_rpc_js_1.moneroRPC.getTransactionPool();
        const recent = (pool.transactions ?? [])
            .sort((a, b) => b.receive_time - a.receive_time)
            .slice(0, 10)
            .map((tx) => ({
            txid: tx.id_hash,
            fee: tx.fee,
            size: tx.blob_size,
            weight: tx.weight,
            feePerByte: tx.weight > 0 ? tx.fee / tx.weight : tx.fee / tx.blob_size,
            receivedAt: tx.receive_time,
            relayed: tx.relayed,
        }));
        return ok(res, recent);
    }
    catch (err) {
        return serverError(res, err);
    }
});
router.get('/fees/recommended', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    return ok(res, state.fees);
});
router.get('/fees/mempool-blocks', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    return ok(res, state.mempoolBlocks);
});
// ── Blocks ───────────────────────────────────────────────────────────────────
router.get('/blocks', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    const countParam = typeof _req.query['count'] === 'string' ? _req.query['count'] : '15';
    const count = Math.min(parseInt(countParam, 10), 50);
    return ok(res, state.recentBlocks.slice(0, count));
});
router.get('/block/tip/height', (_req, res) => {
    const state = mempool_manager_js_1.mempoolManager.getState();
    if (!state)
        return notFound(res, 'Node not yet synced');
    return ok(res, state.networkStats.height);
});
router.get('/block/:hashOrHeight', async (req, res) => {
    try {
        const hashOrHeight = String(req.params['hashOrHeight'] ?? '');
        const isHeight = /^\d+$/.test(hashOrHeight);
        let block;
        if (isHeight) {
            block = await monero_rpc_js_1.moneroRPC.getBlock(parseInt(hashOrHeight, 10));
        }
        else {
            block = await monero_rpc_js_1.moneroRPC.getBlock(undefined, hashOrHeight);
        }
        const h = block.block_header;
        return ok(res, {
            height: h.height,
            hash: h.hash,
            prevHash: h.prev_hash,
            timestamp: h.timestamp,
            size: h.block_size,
            weight: h.block_weight,
            nTx: h.num_txes,
            difficulty: h.difficulty,
            reward: h.reward,
            nonce: h.nonce,
            majorVersion: h.major_version,
            minorVersion: h.minor_version,
            txHashes: block.tx_hashes,
            minerTxHash: block.miner_tx_hash,
        });
    }
    catch (err) {
        return serverError(res, err);
    }
});
// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/tx/:txid', async (req, res) => {
    try {
        const txid = String(req.params['txid'] ?? '');
        const result = await monero_rpc_js_1.moneroRPC.getTransactions([txid], true);
        if (!result.txs || result.txs.length === 0) {
            return notFound(res, `Transaction ${txid} not found`);
        }
        const tx = result.txs[0];
        let parsed = {};
        try {
            parsed = JSON.parse(tx.as_json);
        }
        catch {
            // ignore parse failures
        }
        return ok(res, {
            txid: tx.tx_hash,
            inPool: tx.in_pool,
            blockHeight: tx.block_height,
            blockTimestamp: tx.block_timestamp,
            confirmations: tx.confirmations,
            doubleSpendSeen: tx.double_spend_seen,
            ...parsed,
        });
    }
    catch (err) {
        return serverError(res, err);
    }
});
// ── Backend info ──────────────────────────────────────────────────────────────
router.get('/backend-info', (_req, res) => {
    return ok(res, {
        hostname: 'xmr-mempool',
        version: '1.0.0',
        gitCommit: 'local',
        network: 'mainnet',
    });
});
exports.default = router;
//# sourceMappingURL=routes.js.map