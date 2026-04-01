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

import { moneroRPC, BlockHeader, PoolTransaction, MoneroInfo } from './monero-rpc';

// ── Constants ────────────────────────────────────────────────────────────────

/** Monero's hard-coded max block weight is 2× the long-term median weight.
 *  In practice blocks are ~300 KB, we cap a "mempool block" at this size. */
const MEMPOOL_BLOCK_WEIGHT_CAP = 300_000; // bytes — a safe default
const POLL_INTERVAL_MS = 8_000;           // refresh every 8 s
const INITIAL_BLOCKS_COUNT = 10;          // how many recent blocks to fetch on startup

// ── Types ────────────────────────────────────────────────────────────────────

export interface MempoolBlock {
  index: number;
  blockSize: number;   // bytes (total weight of txs in this projected block)
  nTx: number;
  medianFee: number;   // piconero / byte
  totalFees: number;   // piconero
  feeRange: number[];  // [min, p10, p25, p50, p75, p90, max] piconero/byte
}

export interface RecentBlock {
  height: number;
  hash: string;
  timestamp: number;
  size: number;       // bytes
  weight: number;
  nTx: number;
  difficulty: number;
  reward: number;     // piconero
  medianFee?: number; // piconero / byte (estimated from block weight / fee)
  minorVersion: number;
}

export interface MempoolInfo {
  loadedPercentage: number;
  count: number;       // total pending txs
  vsize: number;       // total weight bytes
  totalFee: number;    // piconero
  memPoolMinFee: number; // piconero/byte (lowest fee in pool)
}

export interface RecommendedFees {
  slowFee: number;     // piconero/byte — ~10+ minutes (deprioritised)
  normalFee: number;   // piconero/byte — next 1–2 blocks
  fastFee: number;     // piconero/byte — next block (high probability)
}

export interface NetworkStats {
  height: number;
  difficulty: number;
  hashrate: number;      // H/s estimated (difficulty / block_time)
  txCount: number;       // total transactions on chain
  txPoolSize: number;    // pending tx count
  version: string;
  blockSizeMedian: number;
  blockWeightMedian: number;
  connections: number;
  synchronized: boolean;
  topBlockHash: string;
  blockTarget: number;   // seconds
}

export interface MempoolState {
  info: MempoolInfo;
  mempoolBlocks: MempoolBlock[];
  recentBlocks: RecentBlock[];
  fees: RecommendedFees;
  networkStats: NetworkStats;
  lastUpdated: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function feePerByte(tx: PoolTransaction): number {
  const size = tx.weight > 0 ? tx.weight : tx.blob_size;
  return size > 0 ? tx.fee / size : 0;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function buildFeeRange(feeRates: number[]): number[] {
  if (feeRates.length === 0) return [0, 0, 0, 0, 0, 0, 0];
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
function buildMempoolBlocks(txs: PoolTransaction[]): MempoolBlock[] {
  if (txs.length === 0) return [];

  // Sort highest fee-per-byte first (miners optimise for revenue)
  const sorted = [...txs].sort((a, b) => feePerByte(b) - feePerByte(a));

  const blocks: MempoolBlock[] = [];
  let currentTxs: PoolTransaction[] = [];
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

function summariseBlock(index: number, txs: PoolTransaction[]): MempoolBlock {
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

function blockHeaderToRecentBlock(header: BlockHeader): RecentBlock {
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

function infoToNetworkStats(info: MoneroInfo): NetworkStats {
  // Approximate hashrate: difficulty / target_seconds
  const hashrate = info.difficulty / (info.target || 120);
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
  };
}

// ── Manager class ─────────────────────────────────────────────────────────────

type ChangeCallback = (state: MempoolState) => void;

class MempoolManager {
  private state: MempoolState | null = null;
  private callbacks: ChangeCallback[] = [];
  private timer: NodeJS.Timeout | null = null;
  private previousTxPoolSize = -1;

  onStateChange(cb: ChangeCallback) {
    this.callbacks.push(cb);
  }

  private notify() {
    if (this.state) {
      for (const cb of this.callbacks) cb(this.state);
    }
  }

  getState(): MempoolState | null {
    return this.state;
  }

  async start() {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => console.error('[mempool] refresh error:', err));
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async refresh() {
    try {
      const [infoResult, poolResult, statsResult, feeResult, lastHeaderResult] =
        await Promise.allSettled([
          moneroRPC.getInfo(),
          moneroRPC.getTransactionPool(),
          moneroRPC.getTransactionPoolStats(),
          moneroRPC.getFeeEstimate(10),
          moneroRPC.getLastBlockHeader(),
        ]);

      // Bail out if info (the most critical call) failed
      if (infoResult.status === 'rejected') {
        console.error('[mempool] getInfo failed:', infoResult.reason);
        return;
      }

      const info = infoResult.value;
      const txs: PoolTransaction[] =
        poolResult.status === 'fulfilled' && poolResult.value.transactions
          ? poolResult.value.transactions
          : [];

      const poolStats =
        statsResult.status === 'fulfilled' ? statsResult.value.pool_stats : null;

      const feeEst = feeResult.status === 'fulfilled' ? feeResult.value : null;

      // ── Mempool info ────────────────────────────────────────────────────
      const totalWeight = txs.reduce(
        (s, tx) => s + (tx.weight > 0 ? tx.weight : tx.blob_size),
        0
      );
      const totalFees = txs.reduce((s, tx) => s + tx.fee, 0);
      const allFeeRates = txs.map(feePerByte).filter((f) => f > 0).sort((a, b) => a - b);
      const minFeeRate = allFeeRates[0] ?? 0;

      const mempoolInfo: MempoolInfo = {
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
      let fees: RecommendedFees;
      if (feeEst && feeEst.fees && feeEst.fees.length >= 3) {
        fees = {
          slowFee: feeEst.fees[0],
          normalFee: feeEst.fees[1],
          fastFee: feeEst.fees[2],
        };
      } else if (feeEst && feeEst.fee) {
        fees = {
          slowFee: Math.round(feeEst.fee * 0.25),
          normalFee: feeEst.fee,
          fastFee: feeEst.fee * 4,
        };
      } else if (allFeeRates.length > 0) {
        fees = {
          slowFee: Math.round(percentile(allFeeRates, 10)),
          normalFee: Math.round(percentile(allFeeRates, 50)),
          fastFee: Math.round(percentile(allFeeRates, 90)),
        };
      } else {
        fees = { slowFee: 20000, normalFee: 80000, fastFee: 320000 };
      }

      // ── Recent blocks ────────────────────────────────────────────────────
      let recentBlocks: RecentBlock[] = this.state?.recentBlocks ?? [];

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
          const rangeResult = await moneroRPC.getBlockHeadersRange(startHeight, tipHeight);
          recentBlocks = rangeResult.headers
            .map(blockHeaderToRecentBlock)
            .reverse(); // newest first
        } catch (err) {
          console.error('[mempool] failed to fetch block headers range:', err);
          // Fallback: just use the last header we have
          if (newTip) {
            recentBlocks = [blockHeaderToRecentBlock(newTip), ...recentBlocks].slice(0, INITIAL_BLOCKS_COUNT);
          }
        }
      }

      // ── Assemble state ───────────────────────────────────────────────────
      const networkStats = infoToNetworkStats(info);

      this.state = {
        info: mempoolInfo,
        mempoolBlocks,
        recentBlocks,
        fees,
        networkStats,
        lastUpdated: Date.now(),
      };

      // Only notify subscribers if something meaningful changed
      const txPoolChanged = info.tx_pool_size !== this.previousTxPoolSize;
      const blockChanged = needsBlockRefresh;
      if (txPoolChanged || blockChanged) {
        this.previousTxPoolSize = info.tx_pool_size;
        this.notify();
      }

      if (process.env.DEBUG) {
        console.log(
          `[mempool] height=${info.height} pool=${txs.length} blocks=${mempoolBlocks.length}`
        );
      }
    } catch (err) {
      console.error('[mempool] unexpected error during refresh:', err);
    }
  }
}

export const mempoolManager = new MempoolManager();
export default MempoolManager;
