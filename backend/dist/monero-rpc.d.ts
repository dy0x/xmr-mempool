/**
 * Monero Daemon RPC Client
 * Talks to monerod's JSON-RPC and REST endpoints.
 * JSON-RPC: POST http://host:port/json_rpc
 * REST:     GET/POST http://host:port/<endpoint>
 *
 * monerod uses HTTP Digest authentication (MD5/MD5-sess), NOT Basic auth.
 * Axios only supports Basic auth natively, so we implement the Digest
 * challenge-response handshake manually via a response interceptor.
 */
export interface MoneroInfo {
    height: number;
    difficulty: number;
    tx_count: number;
    tx_pool_size: number;
    alt_blocks_count: number;
    outgoing_connections_count: number;
    incoming_connections_count: number;
    white_peerlist_size: number;
    grey_peerlist_size: number;
    mainnet: boolean;
    testnet: boolean;
    stagenet: boolean;
    nettype: string;
    top_block_hash: string;
    target: number;
    target_height: number;
    synchronized: boolean;
    block_size_limit: number;
    block_size_median: number;
    block_weight_limit: number;
    block_weight_median: number;
    start_time: number;
    free_space: number;
    version: string;
    status: string;
    cumulative_difficulty: number;
    database_size: number;
}
export interface BlockHeader {
    block_size: number;
    block_weight: number;
    cumulative_difficulty: number;
    depth: number;
    difficulty: number;
    hash: string;
    height: number;
    long_term_weight: number;
    major_version: number;
    minor_version: number;
    nonce: number;
    num_txes: number;
    orphan_status: boolean;
    prev_hash: string;
    reward: number;
    timestamp: number;
    miner_tx_hash: string;
    already_generated_coins?: number;
}
export interface Block {
    blob: string;
    block_header: BlockHeader;
    json: string;
    miner_tx_hash: string;
    tx_hashes: string[];
    status: string;
    untrusted: boolean;
}
export interface PoolTransaction {
    blob_size: number;
    do_not_relay: boolean;
    double_spend_seen: boolean;
    fee: number;
    id_hash: string;
    kept_by_block: boolean;
    last_relayed_time: number;
    max_used_block_height: number;
    receive_time: number;
    relayed: boolean;
    tx_blob: string;
    tx_json: string;
    weight: number;
}
export interface PoolStats {
    bytes_max: number;
    bytes_med: number;
    bytes_min: number;
    bytes_total: number;
    fee_total: number;
    histo_98pc: number;
    num_10m: number;
    num_double_spends: number;
    num_failing: number;
    num_not_relayed: number;
    oldest: number;
    txs_total: number;
}
export interface FeeEstimate {
    fee: number;
    fees: number[];
    quantization_mask: number;
    status: string;
}
export interface MoneroNodeConfig {
    host: string;
    port: number;
    user?: string;
    pass?: string;
}
declare class MoneroRPC {
    private clients;
    constructor(configs: MoneroNodeConfig[]);
    /**
     * Axios response interceptor that implements the Digest auth handshake:
     *   1. Request goes out with no auth header.
     *   2. Server replies 401 + WWW-Authenticate: Digest …
     *   3. We compute the Digest response and retry once.
     */
    private installDigestInterceptor;
    private executeWithFailover;
    private jsonRpc;
    private rest;
    getInfo(): Promise<MoneroInfo>;
    getLastBlockHeader(): Promise<{
        block_header: BlockHeader;
    }>;
    getBlockHeaderByHeight(height: number): Promise<{
        block_header: BlockHeader;
    }>;
    getBlockHeaderByHash(hash: string): Promise<{
        block_header: BlockHeader;
    }>;
    getBlock(height?: number, hash?: string): Promise<Block>;
    getBlockHeadersRange(startHeight: number, endHeight: number): Promise<{
        headers: BlockHeader[];
    }>;
    getTransactionPool(): Promise<{
        transactions: PoolTransaction[];
        status: string;
    }>;
    getTransactionPoolStats(): Promise<{
        pool_stats: PoolStats;
        status: string;
    }>;
    getFeeEstimate(graceBlocks?: number): Promise<FeeEstimate>;
    getTransactions(txids: string[], decodeAsJson?: boolean): Promise<{
        txs: Array<{
            as_hex: string;
            as_json: string;
            block_height: number;
            block_timestamp: number;
            confirmations: number;
            double_spend_seen: boolean;
            in_pool: boolean;
            output_indices: number[];
            pruned_as_hex: string;
            prunable_as_hex: string;
            prunable_hash: string;
            tx_hash: string;
        }>;
        status: string;
    }>;
    getHeight(): Promise<{
        height: number;
        status: string;
    }>;
}
export declare const moneroRPC: MoneroRPC;
export default MoneroRPC;
