/**
 * REST API routes — designed to be consumed by the React frontend.
 * All amounts are in piconero unless otherwise stated.
 */

import { Router, Request, Response } from 'express';
import { mempoolManager, blockHeaderToRecentBlock, minerCache } from './mempool-manager';
import { moneroRPC } from './monero-rpc';

const router = Router();

// ── Helper ────────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown) {
  res.json(data);
}

function notFound(res: Response, msg = 'Not found') {
  res.status(404).json({ error: msg });
}

function serverError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ error: String(err) });
}

// ── Network / Info ────────────────────────────────────────────────────────────

/** Full initial payload — what the frontend requests on first load */
router.get('/init-data', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  return ok(res, {
    blocks: state.recentBlocks.slice(0, 8),
    mempoolInfo: state.info,
    mempoolBlocks: state.mempoolBlocks,
    fees: state.fees,
    networkStats: state.networkStats,
    lastUpdated: state.lastUpdated,
  });
});

router.get('/network-info', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  return ok(res, state.networkStats);
});

// ── Mempool ───────────────────────────────────────────────────────────────────

router.get('/mempool', async (_req: Request, res: Response) => {
  try {
    const state = mempoolManager.getState();
    return ok(res, state?.info ?? { count: 0, vsize: 0, totalFee: 0, memPoolMinFee: 0 });
  } catch (err) {
    return serverError(res, err);
  }
});

router.get('/mempool/txids', async (_req: Request, res: Response) => {
  try {
    const pool = await moneroRPC.getTransactionPool();
    const txids = (pool.transactions ?? []).map((tx) => tx.id_hash);
    return ok(res, txids);
  } catch (err) {
    return serverError(res, err);
  }
});

router.get('/mempool/recent', async (_req: Request, res: Response) => {
  try {
    const pool = await moneroRPC.getTransactionPool();
    const recent = (pool.transactions ?? [])
      .sort((a, b) => b.receive_time - a.receive_time)
      .slice(0, 10)
      .map((tx) => ({
        txid: tx.id_hash,
        fee: tx.fee,
        size: tx.blob_size,
        weight: tx.weight,
        feePerByte: tx.weight > 0 ? tx.fee / tx.weight : tx.fee / tx.blob_size,
        receivedAt: tx.receive_time,
        relayed: tx.relayed,
      }));
    return ok(res, recent);
  } catch (err) {
    return serverError(res, err);
  }
});

router.get('/fees/recommended', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  return ok(res, state.fees);
});

router.get('/fees/mempool-blocks', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  return ok(res, state.mempoolBlocks);
});

const MEMPOOL_BLOCK_CAP = 300_000; // bytes — must match mempool-manager

router.get('/mempool-block/:index', async (req: Request, res: Response) => {
  try {
    const index = parseInt(String(req.params['index'] ?? '0'), 10);
    if (isNaN(index) || index < 0) return notFound(res, 'Invalid block index');

    const pool = await moneroRPC.getTransactionPool();
    const txs  = pool.transactions ?? [];

    // Sort highest fee-per-byte first (mirrors buildMempoolBlocks in mempool-manager)
    const sorted = [...txs].sort((a, b) => {
      const sA = a.weight > 0 ? a.weight : a.blob_size;
      const sB = b.weight > 0 ? b.weight : b.blob_size;
      return (sB > 0 ? b.fee / sB : 0) - (sA > 0 ? a.fee / sA : 0);
    });

    // Bucket into projected blocks
    const blocks: Array<typeof txs> = [[]];
    let currentSize = 0;
    for (const tx of sorted) {
      const txSize = tx.weight > 0 ? tx.weight : tx.blob_size;
      if (currentSize + txSize > MEMPOOL_BLOCK_CAP && blocks[blocks.length - 1].length > 0) {
        blocks.push([]);
        currentSize = 0;
      }
      blocks[blocks.length - 1].push(tx);
      currentSize += txSize;
    }

    if (index >= blocks.length) return notFound(res, `Mempool block ${index} not found`);

    const blockTxs = blocks[index];
    const totalFees = blockTxs.reduce((s, t) => s + t.fee, 0);
    const totalSize = blockTxs.reduce((s, t) => s + (t.weight > 0 ? t.weight : t.blob_size), 0);

    return ok(res, {
      index,
      estimatedMinutes: (index + 1) * 2,
      nTx: blockTxs.length,
      totalFees,
      totalSize,
      transactions: blockTxs.map(tx => {
        const size = tx.weight > 0 ? tx.weight : tx.blob_size;
        return {
          txid:       tx.id_hash,
          fee:        tx.fee,
          size,
          feePerByte: size > 0 ? Math.round(tx.fee / size) : 0,
          receivedAt: tx.receive_time,
        };
      }),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ── Blocks ───────────────────────────────────────────────────────────────────

router.get('/blocks', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  const countParam = typeof _req.query['count'] === 'string' ? _req.query['count'] : '15';
  const count = Math.min(parseInt(countParam, 10), 50);
  return ok(res, state.recentBlocks.slice(0, count));
});

/**
 * Fetch up to 10 confirmed blocks below the given height.
 * Used by the frontend's infinite-scroll block explorer.
 * Pattern mirrors mempool.space GET /api/v1/blocks/:startHeight
 */
router.get('/blocks/:fromHeight', async (req: Request, res: Response) => {
  try {
    const fromHeight = parseInt(String(req.params['fromHeight'] ?? ''), 10);
    if (isNaN(fromHeight) || fromHeight <= 0) return ok(res, []);

    const endHeight   = fromHeight - 1;
    const startHeight = Math.max(0, fromHeight - 10);

    const result = await moneroRPC.getBlockHeadersRange(startHeight, endHeight);
    const blocks = [...result.headers]
      .reverse() // newest-first
      .map(h => {
        const b = blockHeaderToRecentBlock(h);
        const tag = minerCache.get(b.hash);
        if (tag) b.miner = tag;
        return b;
      });

    return ok(res, blocks);
  } catch (err) {
    return serverError(res, err);
  }
});

router.get('/block/tip/height', (_req: Request, res: Response) => {
  const state = mempoolManager.getState();
  if (!state) return notFound(res, 'Node not yet synced');
  return ok(res, state.networkStats.height);
});

router.get('/block/:hashOrHeight', async (req: Request, res: Response) => {
  try {
    const hashOrHeight = String(req.params['hashOrHeight'] ?? '');
    const isHeight = /^\d+$/.test(hashOrHeight);
    let block;
    try {
      block = isHeight
        ? await moneroRPC.getBlock(parseInt(hashOrHeight, 10))
        : await moneroRPC.getBlock(undefined, hashOrHeight);
    } catch {
      // Any failure (RPC -5 not found, connection error, etc.) — return 404
      // so the frontend can try the same hash as a txid instead.
      return notFound(res, `Block "${hashOrHeight}" not found`);
    }
    const h = block.block_header;
    return ok(res, {
      height: h.height,
      hash: h.hash,
      prevHash: h.prev_hash,
      timestamp: h.timestamp,
      size: h.block_size,
      weight: h.block_weight,
      nTx: h.num_txes,
      difficulty: h.difficulty,
      reward: h.reward,
      nonce: h.nonce,
      majorVersion: h.major_version,
      minorVersion: h.minor_version,
      txHashes: block.tx_hashes || [],
      minerTxHash: block.miner_tx_hash,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

/** Parse tx public key and encrypted payment ID out of the extra byte array. */
function parseTxExtra(extra: number[]): { txPublicKey?: string; paymentId?: string } {
  let i = 0;
  let txPublicKey: string | undefined;
  let paymentId: string | undefined;

  while (i < extra.length) {
    const tag = extra[i++];
    if (tag === 0x01) {
      // 32-byte tx public key
      if (i + 32 <= extra.length) {
        txPublicKey = Buffer.from(extra.slice(i, i + 32)).toString('hex');
        i += 32;
      }
    } else if (tag === 0x02) {
      // Nonce: next byte(s) are a varint length
      let len = extra[i++] ?? 0;
      // Handle 2-byte varint (high bit set)
      if (len > 127) { len = (len & 0x7f) | ((extra[i++] ?? 0) << 7); }
      const nonceStart = i;
      if (extra[nonceStart] === 0x09 && len === 9) {
        // Encrypted payment ID (8 bytes after the 0x09 sub-tag)
        paymentId = Buffer.from(extra.slice(nonceStart + 1, nonceStart + 9)).toString('hex');
      }
      i += len;
    } else if (tag === 0x04) {
      break; // padding — rest is zeros
    } else {
      break; // unknown tag
    }
  }

  return { txPublicKey, paymentId };
}

router.get('/tx/:txid', async (req: Request, res: Response) => {
  try {
    const txid = String(req.params['txid'] ?? '');
    const result = await moneroRPC.getTransactions([txid], true);
    if (!result.txs || result.txs.length === 0) {
      return notFound(res, `Transaction ${txid} not found`);
    }
    const tx = result.txs[0];

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(tx.as_json) as Record<string, unknown>; } catch { /* ignore */ }

    const fee   = (parsed.rct_signatures as { txnFee?: number } | undefined)?.txnFee ?? 0;
    const size  = Math.round((tx.as_hex?.length ?? 0) / 2);
    const extra = (parsed.extra ?? []) as number[];
    const { txPublicKey, paymentId } = parseTxExtra(extra);

    // Resolve ring member heights via get_outs
    type RingMember = { index: number; height: number; key: string };
    let ringMembers: RingMember[][] | undefined;
    try {
      interface VinEntry { key: { k_image: string; key_offsets: number[] } }
      const vin = (parsed.vin ?? []) as VinEntry[];
      if (vin.length > 0) {
        const refs: { vi: number; ri: number; abs: number }[] = [];
        for (let vi = 0; vi < vin.length; vi++) {
          let abs = 0;
          for (let ri = 0; ri < vin[vi].key.key_offsets.length; ri++) {
            abs += vin[vi].key.key_offsets[ri];
            refs.push({ vi, ri, abs });
          }
        }
        const outsResult = await moneroRPC.getOuts(refs.map(r => ({ amount: 0, index: r.abs })));
        ringMembers = vin.map(() => [] as RingMember[]);
        for (let i = 0; i < refs.length; i++) {
          ringMembers[refs[i].vi][refs[i].ri] = {
            index: refs[i].abs,
            height: outsResult.outs[i].height,
            key:    outsResult.outs[i].key,
          };
        }
      }
    } catch { /* ring resolution failed — omit */ }

    return ok(res, {
      txid:           tx.tx_hash,
      inPool:         tx.in_pool,
      blockHeight:    tx.block_height,
      blockTimestamp: tx.block_timestamp,
      confirmations:  tx.confirmations,
      doubleSpendSeen: tx.double_spend_seen,
      size,
      fee,
      feePerKb: size > 0 ? Math.round(fee / (size / 1024)) : 0,
      txPublicKey,
      paymentId,
      extraHex: Buffer.from(extra).toString('hex'),
      ringCtType: (parsed.rct_signatures as { type?: number } | undefined)?.type,
      ringMembers,
      ...parsed,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ── Fee history (for chart) ───────────────────────────────────────────────────

const WINDOW_MAP: Record<string, number> = {
  '2h':  2  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '1w':  7  * 24 * 60 * 60 * 1000,
};

router.get('/statistics/fees', (req: Request, res: Response) => {
  const windowKey = String((req.query as Record<string, string>)['window'] ?? '2h');
  const windowMs  = WINDOW_MAP[windowKey] ?? WINDOW_MAP['2h'];
  const history   = mempoolManager.getFeeHistory(windowMs);

  // Down-sample to at most 300 points so the response stays small
  const maxPoints = 300;
  let samples = history;
  if (history.length > maxPoints) {
    const step = Math.ceil(history.length / maxPoints);
    samples = history.filter((_, i) => i % step === 0);
    // Always include the latest point
    const last = history[history.length - 1];
    if (samples[samples.length - 1] !== last) samples.push(last);
  }

  return ok(res, samples);
});

// ── Backend info ──────────────────────────────────────────────────────────────

router.get('/backend-info', (_req: Request, res: Response) => {
  return ok(res, {
    hostname: 'xmr-mempool',
    version: '1.0.0',
    gitCommit: 'local',
    network: 'mainnet',
  });
});

export default router;
