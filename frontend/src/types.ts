/** Shared types between frontend and backend */

export interface MempoolBlock {
  index: number;
  blockSize: number;   // bytes
  nTx: number;
  medianFee: number;   // piconero / byte
  totalFees: number;   // piconero
  feeRange: number[];  // [min, p10, p25, p50, p75, p90, max]
}

export interface RecentBlock {
  height: number;
  hash: string;
  timestamp: number;
  size: number;
  weight: number;
  nTx: number;
  difficulty: number;
  reward: number;      // piconero
  medianFee?: number;
  minorVersion: number;
  isOrphan: boolean;
  miner?: 'p2pool' | string;
}

export interface MempoolInfo {
  loadedPercentage: number;
  count: number;
  vsize: number;       // bytes
  totalFee: number;    // piconero
  memPoolMinFee: number;
}

export interface RecommendedFees {
  slowFee: number;
  normalFee: number;
  fastFee: number;
}

export interface NetworkStats {
  height: number;
  difficulty: number;
  hashrate: number;
  txCount: number;
  txPoolSize: number;
  version: string;
  blockSizeMedian: number;
  blockWeightMedian: number;
  connections: number;
  synchronized: boolean;
  topBlockHash: string;
  blockTarget: number;
  totalEmission?: number;
  activeNodeHost?: string;
}

export interface AppState {
  mempoolBlocks: MempoolBlock[];
  recentBlocks: RecentBlock[];
  mempoolInfo: MempoolInfo | null;
  fees: RecommendedFees | null;
  networkStats: NetworkStats | null;
  connected: boolean;
  loading: boolean;
  lastUpdated: number;
}

// ── Monero helpers ─────────────────────────────────────────────────────────────

/** Convert piconero to XMR string with up to 12 decimal places */
export function piconeroToXMR(piconero: number, decimals = 4): string {
  const xmr = piconero / 1e12;
  return xmr.toFixed(decimals);
}

/** Format bytes into human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Format fee rate (piconero/byte) as XMR/kB */
export function formatFeeRate(picoPerByte: number): string {
  if (picoPerByte <= 0) return '0 XMR/kB';
  const xmrPerKb = (picoPerByte * 1024) / 1e12;
  // toFixed(7) covers the full realistic Monero fee range without scientific notation,
  // then strip trailing zeros for a clean result.
  return xmrPerKb.toFixed(7).replace(/\.?0+$/, '') + ' XMR/kB';
}

/** Format hashrate in human units */
export function formatHashrate(hps: number): string {
  if (hps < 1e3) return `${hps.toFixed(0)} H/s`;
  if (hps < 1e6) return `${(hps / 1e3).toFixed(2)} KH/s`;
  if (hps < 1e9) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps < 1e12) return `${(hps / 1e9).toFixed(2)} GH/s`;
  return `${(hps / 1e12).toFixed(2)} TH/s`;
}

/** Format difficulty nicely */
export function formatDifficulty(diff: number): string {
  if (diff < 1e6) return diff.toLocaleString();
  if (diff < 1e9) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff < 1e12) return `${(diff / 1e9).toFixed(2)}G`;
  return `${(diff / 1e12).toFixed(2)}T`;
}

/** Format a unix timestamp as time-ago */
export function timeAgo(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return 'unknown';
  const diffSec = Math.floor((Date.now() / 1000) - timestamp);
  if (diffSec < 0 || diffSec > 30 * 86400) return 'unknown';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/** Map a fee rate to a colour gradient (green=cheap → orange → red=expensive) */
export function feeRateColor(feeRate: number): string {
  // Monero typical range: 20,000 – 4,000,000 piconero/byte
  const min = 20_000;
  const max = 4_000_000;
  const t = Math.min(1, Math.max(0, (feeRate - min) / (max - min)));
  // green → amber → orange → red
  if (t < 0.25) return '#3bd16f';
  if (t < 0.5) return '#faad14';
  if (t < 0.75) return '#ff6600';
  return '#e84142';
}

/** Fill % for a projected mempool block (assuming 300 KB block cap) */
export function blockFillPercent(blockSize: number): number {
  const cap = 300_000;
  return Math.min(100, (blockSize / cap) * 100);
}
