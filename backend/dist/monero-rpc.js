"use strict";
/**
 * Monero Daemon RPC Client
 * Talks to monerod's JSON-RPC and REST endpoints.
 * JSON-RPC: POST http://host:port/json_rpc
 * REST:     GET/POST http://host:port/<endpoint>
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moneroRPC = void 0;
const axios_1 = __importDefault(require("axios"));
class MoneroRPC {
    constructor(host = '192.168.0.12', port = 18081, user, pass) {
        this.baseUrl = `http://${host}:${port}`;
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' },
            ...(user && pass ? { auth: { username: user, password: pass } } : {}),
        });
    }
    async jsonRpc(method, params = {}) {
        const response = await this.client.post('/json_rpc', {
            jsonrpc: '2.0',
            id: '0',
            method,
            params,
        });
        if (response.data.error) {
            throw new Error(`RPC error [${method}]: ${JSON.stringify(response.data.error)}`);
        }
        return response.data.result;
    }
    async rest(endpoint, method = 'GET', body) {
        const response = await this.client.request({
            url: `/${endpoint}`,
            method,
            data: body,
        });
        return response.data;
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
// Default to port 18089 (restricted RPC — read-only, no auth required).
// To use the full RPC (18081) set MONERO_RPC_PORT=18081 and supply credentials.
exports.moneroRPC = new MoneroRPC(process.env.MONERO_HOST || '192.168.0.12', parseInt(process.env.MONERO_RPC_PORT || '18089', 10), process.env.MONERO_RPC_USER, // undefined → no auth (port 18089)
process.env.MONERO_RPC_PASS);
exports.default = MoneroRPC;
//# sourceMappingURL=monero-rpc.js.map