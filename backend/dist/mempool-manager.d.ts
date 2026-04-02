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
export interface MempoolBlock {
    index: number;
    blockSize: number;
    nTx: number;
    medianFee: number;
    totalFees: number;
    feeRange: number[];
}
export interface RecentBlock {
    height: number;
    hash: string;
    timestamp: number;
    size: number;
    weight: number;
    nTx: number;
    difficulty: number;
    reward: number;
    medianFee?: number;
    minorVersion: number;
}
export interface MempoolInfo {
    loadedPercentage: number;
    count: number;
    vsize: number;
    totalFee: number;
    memPoolMinFee: number;
}
export interface RecommendedFees {
    slowFee: number;
    normalFee: number;
    fastFee: number;
}
export interface FeeSnapshot {
    ts: number;
    slowFee: number;
    normalFee: number;
    fastFee: number;
    txPoolSize: number;
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
}
export interface MempoolState {
    info: MempoolInfo;
    mempoolBlocks: MempoolBlock[];
    recentBlocks: RecentBlock[];
    fees: RecommendedFees;
    networkStats: NetworkStats;
    lastUpdated: number;
}
type ChangeCallback = (state: MempoolState) => void;
declare class MempoolManager {
    private state;
    private callbacks;
    private timer;
    private previousTxPoolSize;
    private feeHistory;
    private feeHistoryFileStream;
    /** Load persisted fee history from disk on startup. */
    private loadFeeHistory;
    /** Append a single snapshot to the JSONL file. */
    private persistSnapshot;
    getFeeHistory(windowMs?: number): FeeSnapshot[];
    getAllFeeHistory(): FeeSnapshot[];
    onStateChange(cb: ChangeCallback): void;
    private notify;
    getState(): MempoolState | null;
    start(): Promise<void>;
    stop(): void;
    private refresh;
}
export declare const mempoolManager: MempoolManager;
export default MempoolManager;
