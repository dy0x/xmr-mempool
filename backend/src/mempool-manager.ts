/**
 * XMRLens — Mempool Manager
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
import fs from 'fs';
import path from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

/** Monero's hard-coded max block weight is 2× the long-term median weight.
 *  In practice blocks are ~300 KB, we cap a "mempool block" at this size. */
const MEMPOOL_BLOCK_WEIGHT_CAP = 300_000;
const POLL_INTERVAL_MS        = 8_000;
const INITIAL_BLOCKS_COUNT    = 60;              // Match fee history window
const INITIAL_FEE_BLOCKS      = 60;              // ~2 h of history to fill chart
const FEE_HISTORY_MAX_POINTS  = 10_800;          // ~24 h at 8 s/poll
const FEE_HISTORY_FILE        = path.join(        // persisted next to the source
  __dirname, '..', 'data', 'fee-history.jsonl'
);
const FEE_HISTORY_KEEP_MS     = 7 * 24 * 60 * 60 * 1000; // keep 1 week on disk

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
  isOrphan: boolean;
  /**
   * Extensible miner tag. Currently populated for P2Pool blocks.
   * Future: add more pools by extending the polling logic below.
   */
  miner?: 'p2pool' | string;
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

export interface FeeSnapshot {
  ts: number;          // unix ms
  slowFee: number;
  normalFee: number;
  fastFee: number;
  txPoolSize: number;
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
  totalEmission?: number; // atomic units (piconero)
  activeNodeHost?: string;
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

export function blockHeaderToRecentBlock(header: BlockHeader): RecentBlock {
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
    isOrphan: header.orphan_status ?? false,
  };
}

// ── Miner detection ────────────────────────────────────────────────────
//
// To add a new pool in future:
//  1. Add a new polling function (see pollP2Pool below as a template).
//  2. Call it in startMinerPolling() below, adding results to minerCache.
//  3. The block enrichment loop in refreshBlocks() picks it up automatically.

/** Block-hash → miner tag, shared across all pools. */
export const minerCache = new Map<string, string>();
/** Block-hash → calculated median fee rate. */
const blockFeeCache = new Map<string, number>();

async function calculateBlockMinFee(hash: string): Promise<number> {
  if (blockFeeCache.has(hash)) return blockFeeCache.get(hash)!;

  try {
    const block = await moneroRPC.getBlock(undefined, hash);
    if (!block.tx_hashes || block.tx_hashes.length === 0) return 0;

    // Fetch all transaction details to get fees and weights
    const res = await moneroRPC.getTransactions(block.tx_hashes, true);
    if (!res.txs || res.txs.length === 0) return 0;

    interface TxJson { rct_signatures?: { txnFee?: number } }
    const rates = res.txs.map(tx => {
      let fee = 0;
      let weight = 0;
      // Fee lives in rct_signatures.txnFee for RCT (v2+) transactions
      if (tx.as_json) {
        try {
          const parsed = JSON.parse(tx.as_json) as TxJson;
          fee = parsed.rct_signatures?.txnFee ?? 0;
        } catch { }
      }
      // Weight = blob byte length (as_hex is hex-encoded, 2 chars per byte)
      if (tx.as_hex) weight = tx.as_hex.length / 2;
      return weight > 0 && fee > 0 ? fee / weight : 0;
    }).filter(r => r > 0).sort((a, b) => a - b);

    if (rates.length === 0) return 0;
    // Use the minimum (rates is sorted ascending) — this is the cheapest fee
    // that actually got confirmed, immune to high-fee outliers.
    const minRate = rates[0];
    blockFeeCache.set(hash, Math.round(minRate));
    return Math.round(minRate);
  } catch (err) {
    console.error(`[mempool] failed to calculate min fee for block ${hash}:`, err);
    return 0;
  }
}

/** Fetch the N most recently found Monero blocks from P2Pool APIs. */
async function pollP2Pool(): Promise<void> {
  const endpoints = [
    'https://p2pool.io/api/found_blocks?limit=100',
    'https://p2pool.observer/api/found_blocks?limit=100'
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      
      const blocks = await resp.json() as Array<{ main_block: { id: string } }>;
      if (!Array.isArray(blocks)) continue;

      for (const b of blocks) {
        if (b?.main_block?.id) {
          minerCache.set(b.main_block.id, 'p2pool');
        }
      }
      
      // Bound cache size: keep the 1000 most-recently-inserted entries
      if (minerCache.size > 1000) {
        const keys = Array.from(minerCache.keys());
        const toDelete = keys.slice(0, minerCache.size - 1000);
        for (const k of toDelete) minerCache.delete(k);
      }
      
      return; // Success, don't try fallback
    } catch (err) {
      // Silently try next endpoint
    }
  }
}

/** Start polling all supported miner APIs. Call once on startup. */
let minerPollingStarted = false;
function startMinerPolling() {
  if (minerPollingStarted) return;
  minerPollingStarted = true;
  // Initial fetch
  void pollP2Pool();
  // Refresh every 2 minutes (well within any rate limit)
  setInterval(() => void pollP2Pool(), 2 * 60 * 1000);
}

function infoToNetworkStats(info: MoneroInfo, lastHeader?: BlockHeader): NetworkStats {
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

// ── Manager class ─────────────────────────────────────────────────────────────

type ChangeCallback = (state: MempoolState) => void;

class MempoolManager {
  private state: MempoolState | null = null;
  private callbacks: ChangeCallback[] = [];
  private timer: NodeJS.Timeout | null = null;
  private previousTxPoolSize = -1;
  private feeHistory: FeeSnapshot[] = [];
  private feeHistoryFileStream: fs.WriteStream | null = null;

  /** Load persisted fee history from disk on startup. */
  private loadFeeHistory() {
    try {
      const dir = path.dirname(FEE_HISTORY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (!fs.existsSync(FEE_HISTORY_FILE)) return;

      const cutoff = Date.now() - FEE_HISTORY_KEEP_MS;
      const lines = fs.readFileSync(FEE_HISTORY_FILE, 'utf8').split('\n');
      const loaded: FeeSnapshot[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const snap = JSON.parse(line) as FeeSnapshot;
          if (snap.ts >= cutoff) loaded.push(snap);
        } catch {
          // skip malformed lines
        }
      }

      // If we pruned anything, rewrite the file without stale entries
      if (loaded.length < lines.filter(l => l.trim()).length) {
        fs.writeFileSync(FEE_HISTORY_FILE, loaded.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
      }

      this.feeHistory = loaded;
      if (loaded.length > 0) {
        console.log(`[mempool] loaded ${loaded.length} fee history points from disk`);
      }
    } catch (err) {
      console.error('[mempool] failed to load fee history:', err);
    }

    // Open append stream for ongoing writes
    try {
      const dir = path.dirname(FEE_HISTORY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.feeHistoryFileStream = fs.createWriteStream(FEE_HISTORY_FILE, { flags: 'a' });
    } catch (err) {
      console.error('[mempool] failed to open fee history file for writing:', err);
    }
  }

  /** Append a single snapshot to the JSONL file. */
  private persistSnapshot(snap: FeeSnapshot) {
    if (!this.feeHistoryFileStream) return;
    try {
      this.feeHistoryFileStream.write(JSON.stringify(snap) + '\n');
    } catch (err) {
      console.error('[mempool] failed to write fee history snapshot:', err);
    }
  }

  getFeeHistory(windowMs = 2 * 60 * 60 * 1000): FeeSnapshot[] {
    const cutoff = Date.now() - windowMs;
    return this.feeHistory.filter(s => s.ts >= cutoff);
  }

  getAllFeeHistory(): FeeSnapshot[] {
    return this.feeHistory;
  }

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
    this.loadFeeHistory();
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => console.error('[mempool] refresh error:', err));
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.feeHistoryFileStream) this.feeHistoryFileStream.end();
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

      // Detect reorg: if the new tip's prev_hash doesn't match our known block at that height-1,
      // the chain has reorganised and we must refetch the full range.
      const knownPrevHash = recentBlocks.find(b => b.height === (newTip?.height ?? 0) - 1)?.hash;
      const reorg = newTip && knownPrevHash && knownPrevHash !== newTip.prev_hash;
      if (reorg) {
        console.warn(`[mempool] Reorg detected at height ${newTip!.height}! Refetching block history.`);
      }

      if (needsBlockRefresh || recentBlocks.length === 0 || reorg) {
        const tipHeight = newTip ? newTip.height : info.height - 1;
        const startHeight = Math.max(0, tipHeight - INITIAL_BLOCKS_COUNT + 1);
        try {
          const rangeResult = await moneroRPC.getBlockHeadersRange(startHeight, tipHeight);
          const base = rangeResult.headers
            .map(blockHeaderToRecentBlock)
            .reverse(); // newest first

          // Enrich with miner tags from the shared minerCache.
          // Already-classified blocks are carried forward from previous state.
          const prevMiner = new Map(recentBlocks.map(b => [b.hash, b.miner]));
          for (const b of base) {
            b.miner = minerCache.get(b.hash) ?? prevMiner.get(b.hash);
          }

          recentBlocks = base;

          // Enrich all recent blocks not already in fee history
          const enrichedTimestamps = new Set(this.feeHistory.map(s => s.ts));
          const toEnrich = recentBlocks
            .slice(0, INITIAL_FEE_BLOCKS)
            .filter(b => !enrichedTimestamps.has(b.timestamp * 1000));

          if (toEnrich.length > 0) {
            if (this.feeHistory.length === 0) {
              console.log(`[mempool] performing initial enrichment of ${toEnrich.length} blocks...`);
            }

            const CHUNK_SIZE = 10;
            const newSnaps: FeeSnapshot[] = [];

            for (let i = 0; i < toEnrich.length; i += CHUNK_SIZE) {
              const chunk = toEnrich.slice(i, i + CHUNK_SIZE);
              await Promise.all(chunk.map(async (block) => {
                if (!block) return;
                const med = await calculateBlockMinFee(block.hash);
                block.medianFee = med;
                newSnaps.push({
                  ts: block.timestamp * 1000,
                  slowFee: Math.round(med * 0.8),
                  normalFee: med,
                  fastFee: Math.round(med * 1.5),
                  txPoolSize: info.tx_pool_size,
                });
              }));
            }

            for (const snap of newSnaps) {
              if (!enrichedTimestamps.has(snap.ts)) {
                this.feeHistory.push(snap);
                this.persistSnapshot(snap);
              }
            }
            this.feeHistory.sort((a, b) => a.ts - b.ts);
            while (this.feeHistory.length > FEE_HISTORY_MAX_POINTS) {
              this.feeHistory.shift();
            }
            console.log(`[mempool] enrichment complete: ${this.feeHistory.length} snapshots total.`);
          }
        } catch (err) {
          console.error('[mempool] failed to fetch block headers range:', err);
          if (newTip) {
            recentBlocks = [blockHeaderToRecentBlock(newTip), ...recentBlocks].slice(0, INITIAL_BLOCKS_COUNT);
          }
        }
      }

      // ── Assemble state ───────────────────────────────────────────────────
      const networkStats = infoToNetworkStats(info, newTip ?? undefined);
      networkStats.activeNodeHost = moneroRPC.getActiveNode()?.host;

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

// Start polling miner identification APIs on process boot
startMinerPolling();

export default MempoolManager;
