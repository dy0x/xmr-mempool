"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moneroRPC = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ── Digest auth ───────────────────────────────────────────────────────────────
function md5(s) {
    return crypto_1.default.createHash('md5').update(s).digest('hex');
}
/**
 * Parse a single Digest challenge from a WWW-Authenticate header value.
 * The header may contain multiple comma-separated challenges; we take the first.
 */
function parseDigestChallenge(wwwAuth) {
    const result = {};
    // Match key="value" or key=value pairs
    const re = /(\w+)=(?:"([^"]*)"|([\w+/=.-]+))/g;
    let m;
    while ((m = re.exec(wwwAuth)) !== null) {
        result[m[1]] = m[2] ?? m[3] ?? '';
    }
    return result;
}
/**
 * Build the Authorization header value for a Digest request.
 */
function buildDigestAuth(method, uri, username, password, challenge) {
    const { realm = '', nonce = '', qop = '', algorithm = 'MD5', opaque } = challenge;
    const cnonce = crypto_1.default.randomBytes(8).toString('hex');
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
    let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", ` +
        `uri="${uri}", response="${response}"`;
    if (firstQop)
        header += `, qop=${firstQop}, nc=${nc}, cnonce="${cnonce}"`;
    if (algorithm && algorithm !== 'MD5')
        header += `, algorithm=${algorithm}`;
    if (opaque)
        header += `, opaque="${opaque}"`;
    return header;
}
class MoneroRPC {
    constructor(configs) {
        this.clients = [];
        if (configs.length === 0) {
            configs = [{ host: '127.0.0.1', port: 18081 }];
        }
        for (const conf of configs) {
            const baseUrl = `http://${conf.host}:${conf.port}`;
            const client = axios_1.default.create({
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
    installDigestInterceptor(client, user, pass) {
        client.interceptors.response.use((res) => res, async (error) => {
            // Only handle 401 Digest challenges, and only retry once.
            const axErr = error;
            if (axErr.response?.status !== 401 ||
                !axErr.config ||
                axErr.config._digestRetried) {
                return Promise.reject(error);
            }
            const wwwAuth = axErr.response.headers['www-authenticate'] ?? '';
            if (!wwwAuth.toLowerCase().includes('digest')) {
                return Promise.reject(error);
            }
            const config = axErr.config;
            config._digestRetried = true;
            const method = (config.method ?? 'GET').toUpperCase();
            // Extract just the path+query for the Digest URI field
            const fullUrl = (config.baseURL ?? '') + (config.url ?? '/');
            let uri;
            try {
                const parsed = new URL(fullUrl);
                uri = parsed.pathname + parsed.search;
            }
            catch {
                uri = config.url ?? '/';
            }
            const challenge = parseDigestChallenge(wwwAuth);
            config.headers['Authorization'] = buildDigestAuth(method, uri, user, pass, challenge);
            return client.request(config);
        });
    }
    async executeWithFailover(operation) {
        let lastError;
        for (let i = 0; i < this.clients.length; i++) {
            const { client, baseUrl } = this.clients[i];
            try {
                const result = await operation(client);
                return result;
            }
            catch (err) {
                lastError = err;
                if (i < this.clients.length - 1) {
                    console.warn(`[monero-rpc] Request failed on ${baseUrl}, trying next node...`);
                }
            }
        }
        throw lastError;
    }
    async jsonRpc(method, params = {}) {
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
            return response.data.result;
        });
    }
    async rest(endpoint, method = 'GET', body) {
        return this.executeWithFailover(async (client) => {
            const response = await client.request({
                url: `/${endpoint}`,
                method,
                data: body,
            });
            return response.data;
        });
    }
    async getInfo() {
        return this.jsonRpc('get_info');
    }
    async getLastBlockHeader() {
        return this.jsonRpc('get_last_block_header');
    }
    async getBlockHeaderByHeight(height) {
        return this.jsonRpc('get_block_header_by_height', { height });
    }
    async getBlockHeaderByHash(hash) {
        return this.jsonRpc('get_block_header_by_hash', { hash });
    }
    async getBlock(height, hash) {
        const params = {};
        if (height !== undefined)
            params.height = height;
        if (hash !== undefined)
            params.hash = hash;
        return this.jsonRpc('get_block', params);
    }
    async getBlockHeadersRange(startHeight, endHeight) {
        return this.jsonRpc('get_block_headers_range', {
            start_height: startHeight,
            end_height: endHeight,
        });
    }
    async getTransactionPool() {
        return this.rest('get_transaction_pool', 'GET');
    }
    async getTransactionPoolStats() {
        return this.rest('get_transaction_pool_stats', 'GET');
    }
    async getFeeEstimate(graceBlocks = 10) {
        return this.rest(`get_fee_estimate?grace_blocks=${graceBlocks}`, 'GET');
    }
    async getTransactions(txids, decodeAsJson = false) {
        return this.rest('get_transactions', 'POST', {
            txs_hashes: txids,
            decode_as_json: decodeAsJson,
        });
    }
    async getHeight() {
        return this.rest('get_height', 'GET');
    }
}
// ── Singleton ─────────────────────────────────────────────────────────────────
function loadConfigNodes() {
    try {
        const configPath = path_1.default.join(__dirname, '..', 'config.json');
        if (fs_1.default.existsSync(configPath)) {
            const raw = fs_1.default.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
                return parsed.nodes;
            }
        }
    }
    catch (err) {
        console.error('[monero-rpc] Error reading config.json:', err);
    }
    // Fallback to env vars
    return [{
            host: process.env.MONERO_HOST || '192.168.0.12',
            port: parseInt(process.env.MONERO_RPC_PORT || '18081', 10),
            user: process.env.MONERO_RPC_USER || 'monero',
            pass: process.env.MONERO_RPC_PASS || 'WsPs_7onqOlvSNlaHltNn7MkCNpVs7XIZKD8WKEgVp0=',
        }];
}
exports.moneroRPC = new MoneroRPC(loadConfigNodes());
exports.default = MoneroRPC;
//# sourceMappingURL=monero-rpc.js.map