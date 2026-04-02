"use strict";
/**
 * Mempool Manager
 * Polls the Monero node for mempool + block data and projects
 * "mempool blocks" the same way mempool.space does for Bitcoin.
 *
 * Key Monero facts:
 *   - Block target: 120s (2 minutes)
 *   - Dynamic block size — long-term median weight used as soft limit
 *   - Fee unit: piconero / byte (1 XMR = 1e12 piconero)
 *   - No fee bumping / RBF / CPFP
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mempoolManager = void 0;
const monero_rpc_1 = require("./monero-rpc");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ── Constants ────────────────────────────────────────────────────────────────
/** Monero's hard-coded max block weight is 2× the long-term median weight.
 *  In practice blocks are ~300 KB, we cap a "mempool block" at this size. */
const MEMPOOL_BLOCK_WEIGHT_CAP = 300000;
const POLL_INTERVAL_MS = 8000;
const INITIAL_BLOCKS_COUNT = 40;
const FEE_HISTORY_MAX_POINTS = 10800; // ~24 h at 8 s/poll
const FEE_HISTORY_FILE = path_1.default.join(// persisted next to the source
__dirname, '..', 'data', 'fee-history.jsonl');
const FEE_HISTORY_KEEP_MS = 7 * 24 * 60 * 60 * 1000; // keep 1 week on disk
// ── Helpers ──────────────────────────────────────────────────────────────────
function feePerByte(tx) {
    const size = tx.weight > 0 ? tx.weight : tx.blob_size;
    return size > 0 ? tx.fee / size : 0;
}
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
}
function buildFeeRange(feeRates) {
    if (feeRates.length === 0)
        return [0, 0, 0, 0, 0, 0, 0];
    const sorted = [...feeRates].sort((a, b) => a - b);
    return [
        sorted[0],
        percentile(sorted, 10),
        percentile(sorted, 25),
        percentile(sorted, 50),
        percentile(sorted, 75),
        percentile(sorted, 90),
        sorted[sorted.length - 1],
    ];
}
/** Bucket mempool transactions into projected blocks. */
function buildMempoolBlocks(txs) {
    if (txs.length === 0)
        return [];
    // Sort highest fee-per-byte first (miners optimise for revenue)
    const sorted = [...txs].sort((a, b) => feePerByte(b) - feePerByte(a));
    const blocks = [];
    let currentTxs = [];
    let currentSize = 0;
    for (const tx of sorted) {
        const txSize = tx.weight > 0 ? tx.weight : tx.blob_size;
        if (currentSize + txSize > MEMPOOL_BLOCK_WEIGHT_CAP && currentTxs.length > 0) {
            blocks.push(summariseBlock(blocks.length, currentTxs));
            currentTxs = [];
            currentSize = 0;
        }
        currentTxs.push(tx);
        currentSize += txSize;
    }
    if (currentTxs.length > 0) {
        blocks.push(summariseBlock(blocks.length, currentTxs));
    }
    return blocks;
}
function summariseBlock(index, txs) {
    const feeRates = txs.map(feePerByte);
    const sorted = [...feeRates].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const totalFees = txs.reduce((s, tx) => s + tx.fee, 0);
    const blockSize = txs.reduce((s, tx) => s + (tx.weight > 0 ? tx.weight : tx.blob_size), 0);
    return {
        index,
        blockSize,
        nTx: txs.length,
        medianFee: Math.round(median),
        totalFees,
        feeRange: buildFeeRange(feeRates),
    };
}
function blockHeaderToRecentBlock(header) {
    return {
        height: header.height,
        hash: header.hash,
        timestamp: header.timestamp,
        size: header.block_size,
        weight: header.block_weight,
        nTx: header.num_txes,
        difficulty: header.difficulty,
        reward: header.reward,
        minorVersion: header.minor_version,
    };
}
function infoToNetworkStats(info, lastHeader) {
    // Approximate hashrate: difficulty / target_seconds
    const hashrate = info.difficulty / (info.target || 120);
    // Calculate mathematically if the node omits already_generated_coins
    let circulatingEmission = lastHeader?.already_generated_coins;
    if (!circulatingEmission) {
        const tailHeight = 2641623;
        const tailSupply = 18132000; // XMR total supply at height 2641623
        if (info.height > tailHeight) {
            const blocksSinceTail = info.height - tailHeight;
            circulatingEmission = (tailSupply + (blocksSinceTail * 0.6)) * 1e12; // back to piconeros
        }
    }
    return {
        height: info.height,
        difficulty: info.difficulty,
        hashrate,
        txCount: info.tx_count,
        txPoolSize: info.tx_pool_size,
        version: info.version,
        blockSizeMedian: info.block_size_median,
        blockWeightMedian: info.block_weight_median,
        connections: info.outgoing_connections_count + info.incoming_connections_count,
        synchronized: info.synchronized,
        topBlockHash: info.top_block_hash,
        blockTarget: info.target,
        totalEmission: circulatingEmission,
    };
}
class MempoolManager {
    constructor() {
        this.state = null;
        this.callbacks = [];
        this.timer = null;
        this.previousTxPoolSize = -1;
        this.feeHistory = [];
        this.feeHistoryFileStream = null;
    }
    /** Load persisted fee history from disk on startup. */
    loadFeeHistory() {
        try {
            const dir = path_1.default.dirname(FEE_HISTORY_FILE);
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            if (!fs_1.default.existsSync(FEE_HISTORY_FILE))
                return;
            const cutoff = Date.now() - FEE_HISTORY_KEEP_MS;
            const lines = fs_1.default.readFileSync(FEE_HISTORY_FILE, 'utf8').split('\n');
            const loaded = [];
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const snap = JSON.parse(line);
                    if (snap.ts >= cutoff)
                        loaded.push(snap);
                }
                catch {
                    // skip malformed lines
                }
            }
            // If we pruned anything, rewrite the file without stale entries
            if (loaded.length < lines.filter(l => l.trim()).length) {
                fs_1.default.writeFileSync(FEE_HISTORY_FILE, loaded.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
            }
            this.feeHistory = loaded;
            if (loaded.length > 0) {
                console.log(`[mempool] loaded ${loaded.length} fee history points from disk`);
            }
        }
        catch (err) {
            console.error('[mempool] failed to load fee history:', err);
        }
        // Open append stream for ongoing writes
        try {
            const dir = path_1.default.dirname(FEE_HISTORY_FILE);
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            this.feeHistoryFileStream = fs_1.default.createWriteStream(FEE_HISTORY_FILE, { flags: 'a' });
        }
        catch (err) {
            console.error('[mempool] failed to open fee history file for writing:', err);
        }
    }
    /** Append a single snapshot to the JSONL file. */
    persistSnapshot(snap) {
        if (!this.feeHistoryFileStream)
            return;
        try {
            this.feeHistoryFileStream.write(JSON.stringify(snap) + '\n');
        }
        catch (err) {
            console.error('[mempool] failed to write fee history snapshot:', err);
        }
    }
    getFeeHistory(windowMs = 2 * 60 * 60 * 1000) {
        const cutoff = Date.now() - windowMs;
        return this.feeHistory.filter(s => s.ts >= cutoff);
    }
    getAllFeeHistory() {
        return this.feeHistory;
    }
    onStateChange(cb) {
        this.callbacks.push(cb);
    }
    notify() {
        if (this.state) {
            for (const cb of this.callbacks)
                cb(this.state);
        }
    }
    getState() {
        return this.state;
    }
    async start() {
        this.loadFeeHistory();
        await this.refresh();
        this.timer = setInterval(() => {
            this.refresh().catch((err) => console.error('[mempool] refresh error:', err));
        }, POLL_INTERVAL_MS);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        if (this.feeHistoryFileStream)
            this.feeHistoryFileStream.end();
    }
    async refresh() {
        try {
            const [infoResult, poolResult, statsResult, feeResult, lastHeaderResult] = await Promise.allSettled([
                monero_rpc_1.moneroRPC.getInfo(),
                monero_rpc_1.moneroRPC.getTransactionPool(),
                monero_rpc_1.moneroRPC.getTransactionPoolStats(),
                monero_rpc_1.moneroRPC.getFeeEstimate(10),
                monero_rpc_1.moneroRPC.getLastBlockHeader(),
            ]);
            // Bail out if info (the most critical call) failed
            if (infoResult.status === 'rejected') {
                console.error('[mempool] getInfo failed:', infoResult.reason);
                return;
            }
            const info = infoResult.value;
            const txs = poolResult.status === 'fulfilled' && poolResult.value.transactions
                ? poolResult.value.transactions
                : [];
            const poolStats = statsResult.status === 'fulfilled' ? statsResult.value.pool_stats : null;
            const feeEst = feeResult.status === 'fulfilled' ? feeResult.value : null;
            // ── Mempool info ────────────────────────────────────────────────────
            const totalWeight = txs.reduce((s, tx) => s + (tx.weight > 0 ? tx.weight : tx.blob_size), 0);
            const totalFees = txs.reduce((s, tx) => s + tx.fee, 0);
            const allFeeRates = txs.map(feePerByte).filter((f) => f > 0).sort((a, b) => a - b);
            const minFeeRate = allFeeRates[0] ?? 0;
            const mempoolInfo = {
                loadedPercentage: 100,
                count: txs.length,
                vsize: totalWeight,
                totalFee: totalFees,
                memPoolMinFee: Math.round(minFeeRate),
            };
            // ── Projected mempool blocks ─────────────────────────────────────────
            const mempoolBlocks = buildMempoolBlocks(txs);
            // ── Fee recommendations ──────────────────────────────────────────────
            // Use daemon's fee tiers if available (fees array = [slow, normal, fast, fastest])
            // Otherwise derive from mempool percentiles.
            let fees;
            if (feeEst && feeEst.fees && feeEst.fees.length >= 3) {
                fees = {
                    slowFee: feeEst.fees[0],
                    normalFee: feeEst.fees[1],
                    fastFee: feeEst.fees[2],
                };
            }
            else if (feeEst && feeEst.fee) {
                fees = {
                    slowFee: Math.round(feeEst.fee * 0.25),
                    normalFee: feeEst.fee,
                    fastFee: feeEst.fee * 4,
                };
            }
            else if (allFeeRates.length > 0) {
                fees = {
                    slowFee: Math.round(percentile(allFeeRates, 10)),
                    normalFee: Math.round(percentile(allFeeRates, 50)),
                    fastFee: Math.round(percentile(allFeeRates, 90)),
                };
            }
            else {
                fees = { slowFee: 20000, normalFee: 80000, fastFee: 320000 };
            }
            // ── Recent blocks ────────────────────────────────────────────────────
            let recentBlocks = this.state?.recentBlocks ?? [];
            // On first load, or when a new block arrives, (re)fetch recent headers.
            const newTip = lastHeaderResult.status === 'fulfilled'
                ? lastHeaderResult.value.block_header
                : null;
            const knownTip = recentBlocks[0]?.height ?? -1;
            const needsBlockRefresh = newTip && newTip.height > knownTip;
            if (needsBlockRefresh || recentBlocks.length === 0) {
                const tipHeight = newTip ? newTip.height : info.height - 1;
                const startHeight = Math.max(0, tipHeight - INITIAL_BLOCKS_COUNT + 1);
                try {
                    const rangeResult = await monero_rpc_1.moneroRPC.getBlockHeadersRange(startHeight, tipHeight);
                    recentBlocks = rangeResult.headers
                        .map(blockHeaderToRecentBlock)
                        .reverse(); // newest first
                }
                catch (err) {
                    console.error('[mempool] failed to fetch block headers range:', err);
                    // Fallback: just use the last header we have
                    if (newTip) {
                        recentBlocks = [blockHeaderToRecentBlock(newTip), ...recentBlocks].slice(0, INITIAL_BLOCKS_COUNT);
                    }
                }
            }
            // ── Assemble state ───────────────────────────────────────────────────
            const networkStats = infoToNetworkStats(info, newTip ?? undefined);
            this.state = {
                info: mempoolInfo,
                mempoolBlocks,
                recentBlocks,
                fees,
                networkStats,
                lastUpdated: Date.now(),
            };
            // Record fee history snapshot every poll
            const snap = {
                ts: Date.now(),
                slowFee: fees.slowFee,
                normalFee: fees.normalFee,
                fastFee: fees.fastFee,
                txPoolSize: info.tx_pool_size,
            };
            this.feeHistory.push(snap);
            this.persistSnapshot(snap);
            if (this.feeHistory.length > FEE_HISTORY_MAX_POINTS) {
                this.feeHistory.shift();
            }
            // Only notify subscribers if something meaningful changed
            const txPoolChanged = info.tx_pool_size !== this.previousTxPoolSize;
            const blockChanged = needsBlockRefresh;
            if (txPoolChanged || blockChanged) {
                this.previousTxPoolSize = info.tx_pool_size;
                this.notify();
            }
            if (process.env.DEBUG) {
                console.log(`[mempool] height=${info.height} pool=${txs.length} blocks=${mempoolBlocks.length}`);
            }
        }
        catch (err) {
            console.error('[mempool] unexpected error during refresh:', err);
        }
    }
}
exports.mempoolManager = new MempoolManager();
exports.default = MempoolManager;
//# sourceMappingURL=mempool-manager.js.map