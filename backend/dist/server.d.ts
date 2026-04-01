/**
 * XMR Mempool — Express + WebSocket server
 *
 * WebSocket protocol (mirrors mempool.space):
 *   Client → Server:  { action: "want", data: ["blocks","mempool-blocks","stats"] }
 *   Server → Client:  { type: "init", payload: <MempoolState> }
 *                     { type: "mempool-blocks", payload: MempoolBlock[] }
 *                     { type: "stats", payload: { mempoolInfo, fees, networkStats } }
 *                     { type: "blocks", payload: RecentBlock[] }
 */
export {};
