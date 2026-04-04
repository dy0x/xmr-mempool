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

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Digest auth ───────────────────────────────────────────────────────────────

function md5(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * Parse a single Digest challenge from a WWW-Authenticate header value.
 * The header may contain multiple comma-separated challenges; we take the first.
 */
function parseDigestChallenge(wwwAuth: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match key="value" or key=value pairs
  const re = /(\w+)=(?:"([^"]*)"|([\w+/=.-]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wwwAuth)) !== null) {
    result[m[1]] = m[2] ?? m[3] ?? '';
  }
  return result;
}

/**
 * Build the Authorization header value for a Digest request.
 */
function buildDigestAuth(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>
): string {
  const { realm = '', nonce = '', qop = '', algorithm = 'MD5', opaque } = challenge;
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';

  // HA1
  const ha1base = md5(`${username}:${realm}:${password}`);
  const ha1 = algorithm.toUpperCase() === 'MD5-SESS'
    ? md5(`${ha1base}:${nonce}:${cnonce}`)
    : ha1base;

  // HA2 (auth-int is uncommon; monerod uses plain auth)
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);

  // Response
  const firstQop = qop.split(',')[0]?.trim();
  const response = (firstQop === 'auth' || firstQop === 'auth-int')
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${firstQop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  let header =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", ` +
    `uri="${uri}", response="${response}"`;

  if (firstQop) header += `, qop=${firstQop}, nc=${nc}, cnonce="${cnonce}"`;
  if (algorithm && algorithm !== 'MD5') header += `, algorithm=${algorithm}`;
  if (opaque) header += `, opaque="${opaque}"`;

  return header;
}

// Internal flag type to track retried requests
interface DigestConfig extends InternalAxiosRequestConfig {
  _digestRetried?: boolean;
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── RPC client ────────────────────────────────────────────────────────────────

export interface MoneroNodeConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
}

class MoneroRPC {
  private clients: { client: AxiosInstance; baseUrl: string; config: MoneroNodeConfig }[] = [];

  constructor(configs: MoneroNodeConfig[]) {
    if (configs.length === 0) {
      configs = [{ host: '127.0.0.1', port: 18081 }];
    }

    for (const conf of configs) {
      const baseUrl = `http://${conf.host}:${conf.port}`;
      const client = axios.create({
        baseURL: baseUrl,
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      if (conf.user && conf.pass) {
        this.installDigestInterceptor(client, conf.user, conf.pass);
      }

      this.clients.push({ client, baseUrl, config: conf });
    }
  }

  /**
   * Axios response interceptor that implements the Digest auth handshake:
   *   1. Request goes out with no auth header.
   *   2. Server replies 401 + WWW-Authenticate: Digest …
   *   3. We compute the Digest response and retry once.
   */
  private installDigestInterceptor(client: AxiosInstance, user: string, pass: string) {
    client.interceptors.response.use(
      (res) => res,
      async (error: unknown) => {
        // Only handle 401 Digest challenges, and only retry once.
        const axErr = error as { response?: { status: number; headers: Record<string, string> }; config?: DigestConfig };
        if (
          axErr.response?.status !== 401 ||
          !axErr.config ||
          axErr.config._digestRetried
        ) {
          return Promise.reject(error);
        }

        const wwwAuth: string = axErr.response.headers['www-authenticate'] ?? '';
        if (!wwwAuth.toLowerCase().includes('digest')) {
          return Promise.reject(error);
        }

        const config = axErr.config as DigestConfig;
        config._digestRetried = true;

        const method = (config.method ?? 'GET').toUpperCase();
        // Extract just the path+query for the Digest URI field
        const fullUrl = (config.baseURL ?? '') + (config.url ?? '/');
        let uri: string;
        try {
          const parsed = new URL(fullUrl);
          uri = parsed.pathname + parsed.search;
        } catch {
          uri = config.url ?? '/';
        }

        const challenge = parseDigestChallenge(wwwAuth);
        config.headers['Authorization'] = buildDigestAuth(
          method, uri, user, pass, challenge
        );

        return client.request(config);
      }
    );
  }

  private async executeWithFailover<T>(operation: (client: AxiosInstance) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      const { client, baseUrl } = this.clients[i];
      try {
        const result = await operation(client);
        return result;
      } catch (err: any) {
        lastError = err;
        if (i < this.clients.length - 1) {
          console.warn(`[monero-rpc] Request failed on ${baseUrl}, trying next node...`);
        }
      }
    }

    throw lastError;
  }

  private async jsonRpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.executeWithFailover(async (client) => {
      const response = await client.post('/json_rpc', {
        jsonrpc: '2.0',
        id: '0',
        method,
        params,
      });
      if (response.data.error) {
        throw new Error(`RPC error [${method}]: ${JSON.stringify(response.data.error)}`);
      }
      return response.data.result as T;
    });
  }

  private async rest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    return this.executeWithFailover(async (client) => {
      const response = await client.request({
        url: `/${endpoint}`,
        method,
        data: body,
      });
      return response.data as T;
    });
  }

  async getInfo(): Promise<MoneroInfo> {
    return this.jsonRpc<MoneroInfo>('get_info');
  }

  async getLastBlockHeader(): Promise<{ block_header: BlockHeader }> {
    return this.jsonRpc('get_last_block_header');
  }

  async getBlockHeaderByHeight(height: number): Promise<{ block_header: BlockHeader }> {
    return this.jsonRpc('get_block_header_by_height', { height });
  }

  async getBlockHeaderByHash(hash: string): Promise<{ block_header: BlockHeader }> {
    return this.jsonRpc('get_block_header_by_hash', { hash });
  }

  async getBlock(height?: number, hash?: string): Promise<Block> {
    const params: Record<string, unknown> = {};
    if (height !== undefined) params.height = height;
    if (hash !== undefined) params.hash = hash;
    return this.jsonRpc<Block>('get_block', params);
  }

  async getBlockHeadersRange(startHeight: number, endHeight: number): Promise<{ headers: BlockHeader[] }> {
    return this.jsonRpc('get_block_headers_range', {
      start_height: startHeight,
      end_height: endHeight,
    });
  }

  async getTransactionPool(): Promise<{ transactions: PoolTransaction[]; status: string }> {
    return this.rest<{ transactions: PoolTransaction[]; status: string }>(
      'get_transaction_pool',
      'GET'
    );
  }

  async getTransactionPoolStats(): Promise<{ pool_stats: PoolStats; status: string }> {
    return this.rest<{ pool_stats: PoolStats; status: string }>(
      'get_transaction_pool_stats',
      'GET'
    );
  }

  async getFeeEstimate(graceBlocks: number = 10): Promise<FeeEstimate> {
    return this.rest<FeeEstimate>(`get_fee_estimate?grace_blocks=${graceBlocks}`, 'GET');
  }

  async getTransactions(txids: string[], decodeAsJson: boolean = false): Promise<{
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
  }> {
    return this.rest('get_transactions', 'POST', {
      txs_hashes: txids,
      decode_as_json: decodeAsJson,
    });
  }

  async getHeight(): Promise<{ height: number; status: string }> {
    return this.rest<{ height: number; status: string }>('get_height', 'GET');
  }

  async getOuts(outputs: Array<{ amount: number; index: number }>): Promise<{
    outs: Array<{ key: string; mask: string; unlocked: boolean; height: number; txid: string }>;
  }> {
    return this.jsonRpc('get_outs', { outputs, get_txid: false });
  }

}

// ── Singleton ─────────────────────────────────────────────────────────────────

function loadConfigNodes(): MoneroNodeConfig[] {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return parsed.nodes;
      }
    }
  } catch (err) {
    console.error('[monero-rpc] Error reading config.json:', err);
  }

  // Fallback to env vars
  return [{
    host: process.env.MONERO_HOST     || '192.168.0.12',
    port: parseInt(process.env.MONERO_RPC_PORT || '18081', 10),
    user: process.env.MONERO_RPC_USER || 'monero',
    pass: process.env.MONERO_RPC_PASS || 'WsPs_7onqOlvSNlaHltNn7MkCNpVs7XIZKD8WKEgVp0=',
  }];
}

export const moneroRPC = new MoneroRPC(loadConfigNodes());

export default MoneroRPC;
