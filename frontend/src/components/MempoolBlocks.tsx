/**
 * MempoolBlocks — the signature mempool.space visualisation.
 *
 * Layout:  [pending blocks ← faded] ──→──  [confirmed blocks → solid]
 *
 * Each block is a rectangle coloured by median fee rate with a fill
 * bar showing how full it is relative to the Monero block weight median.
 */

import { Link } from 'react-router-dom';
import type { MempoolBlock, RecentBlock } from '../types';
import {
  feeRateColor,
  blockFillPercent,
  formatBytes,
  formatFeeRate,
  piconeroToXMR,
  timeAgo,
} from '../types';

interface Props {
  mempoolBlocks: MempoolBlock[];
  recentBlocks: RecentBlock[];
}

const MAX_MEMPOOL_BLOCKS = 5;   // how many pending blocks to show
const MAX_RECENT_BLOCKS  = 6;   // how many confirmed blocks to show

export default function MempoolBlocks({ mempoolBlocks, recentBlocks }: Props) {
  const pending  = mempoolBlocks.slice(0, MAX_MEMPOOL_BLOCKS);
  const recent   = recentBlocks.slice(0, MAX_RECENT_BLOCKS);

  return (
    <div className="blockchain-view">
      {/* Pending mempool blocks — faded, left side */}
      <div className="pending-blocks">
        {pending.length === 0 && (
          <div className="empty-mempool">
            <span>Mempool empty</span>
            <span className="empty-sub">No pending transactions</span>
          </div>
        )}
        {[...pending].reverse().map((block) => (
          <PendingBlock key={block.index} block={block} />
        ))}
      </div>

      {/* Arrow */}
      <div className="blockchain-arrow">
        <svg viewBox="0 0 60 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M0 15 H52 M40 3 L52 15 L40 27"
            stroke="#ff6600"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="arrow-label">Confirmed</div>
      </div>

      {/* Recent confirmed blocks — solid, right side */}
      <div className="recent-blocks">
        {recent.map((block, i) => (
          <ConfirmedBlock key={block.height} block={block} isLatest={i === 0} />
        ))}
      </div>
    </div>
  );
}

// ── Pending block ─────────────────────────────────────────────────────────────

function PendingBlock({ block }: { block: MempoolBlock }) {
  const color   = feeRateColor(block.medianFee);
  const fill    = blockFillPercent(block.blockSize);
  const isEmpty = block.nTx === 0;

  return (
    <div className="block-card block-pending" title={pendingTooltip(block)}>
      {/* Fill bar (inside the block) */}
      <div className="block-fill-bg">
        <div
          className="block-fill-bar"
          style={{ height: `${fill}%`, background: color + '55' }}
        />
      </div>

      {/* Content */}
      <div className="block-content">
        {isEmpty ? (
          <span className="block-empty-label">Empty</span>
        ) : (
          <>
            <div className="block-fee" style={{ color }}>
              {formatFeeRate(block.medianFee)}
            </div>
            <div className="block-txcount">{block.nTx.toLocaleString()} txs</div>
            <div className="block-size">{formatBytes(block.blockSize)}</div>
          </>
        )}
      </div>

      {/* Index label */}
      <div className="block-index-label">In {block.index + 1} block{block.index > 0 ? 's' : ''}</div>
    </div>
  );
}

function pendingTooltip(block: MempoolBlock): string {
  return [
    `Projected block #${block.index + 1}`,
    `Transactions: ${block.nTx.toLocaleString()}`,
    `Size: ${formatBytes(block.blockSize)}`,
    `Median fee: ${formatFeeRate(block.medianFee)}`,
    `Total fees: ${piconeroToXMR(block.totalFees)} XMR`,
  ].join('\n');
}

// ── Confirmed block ───────────────────────────────────────────────────────────

function ConfirmedBlock({ block, isLatest }: { block: RecentBlock; isLatest: boolean }) {
  // Colour confirmed blocks by size relative to median (~300 KB)
  const fillColor = block.nTx > 0 ? '#ff6600' : '#555';

  return (
    <Link
      to={`/block/${block.height}`}
      className={`block-card block-confirmed ${isLatest ? 'block-latest' : ''}`}
      title={confirmedTooltip(block)}
    >
      {/* Fill bar */}
      <div className="block-fill-bg">
        <div
          className="block-fill-bar"
          style={{
            height: `${Math.min(100, (block.size / 300_000) * 100)}%`,
            background: fillColor + '44',
          }}
        />
      </div>

      <div className="block-content">
        <div className="block-height" style={{ color: isLatest ? '#ff6600' : '#e4e4e4' }}>
          {block.height.toLocaleString()}
        </div>
        <div className="block-txcount">{block.nTx.toLocaleString()} txs</div>
        <div className="block-size">{formatBytes(block.size)}</div>
        <div className="block-time">{timeAgo(block.timestamp)}</div>
      </div>
    </Link>
  );
}

function confirmedTooltip(block: RecentBlock): string {
  return [
    `Block #${block.height.toLocaleString()}`,
    `Hash: ${block.hash.slice(0, 16)}…`,
    `Transactions: ${block.nTx.toLocaleString()}`,
    `Size: ${formatBytes(block.size)}`,
    `Reward: ${piconeroToXMR(block.reward, 6)} XMR`,
    `${timeAgo(block.timestamp)}`,
  ].join('\n');
}
