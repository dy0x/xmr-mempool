/**
 * MempoolBlocks — the signature visualisation.
 *
 * Layout (horizontally scrollable, auto-centred on the arrow):
 *   ← [older pending] … [pending 2] [pending 1] ──→── [latest] [older confirmed] … →
 *
 * Each block shows a gradient fill (cheap=green at bottom → expensive=red at top)
 * that rises to represent how full the block is. Flat design, no 3D clipping.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MempoolBlock, RecentBlock } from '../types';
import { feeRateColor, formatBytes, formatFeeRate, piconeroToXMR, timeAgo } from '../types';

interface Props {
  mempoolBlocks: MempoolBlock[];
  recentBlocks:  RecentBlock[];
}

const MAX_PENDING = 40;
const MAX_RECENT  = 60;
const BLOCK_CAP   = 300_000; // bytes — used for fill %

export default function MempoolBlocks({ mempoolBlocks, recentBlocks }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  const pending = mempoolBlocks.slice(0, MAX_PENDING);
  const recent  = recentBlocks.slice(0, MAX_RECENT);

  // Drag-to-scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [dragMoved, setDragMoved] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    setIsDragging(true);
    setDragMoved(false);
    setStartX(e.pageX - el.offsetLeft);
    setScrollLeft(el.scrollLeft);
  };

  const stopDragging = () => {
    setIsDragging(false);
    // Use a tiny timeout so the click event on Link can be captured/prevented if needed
    setTimeout(() => setDragMoved(false), 0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Scroll speed factor
    if (Math.abs(walk) > 5) setDragMoved(true);
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  // Prevent clicking blocks if we were dragging
  const handleBlockClick = (e: React.MouseEvent) => {
    if (dragMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Ensure the chain defaults to being aligned with the content margin (scrollLeft 0)
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    requestAnimationFrame(() => {
      scrollEl.scrollLeft = 0;
    });
  }, [recent[0]?.height]); // Recalculate if the latest block changes, but keep it start-aligned

  return (
    <div 
      className={`blockchain-scroll-outer ${isDragging ? 'is-dragging' : ''}`} 
      ref={scrollRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={stopDragging}
      onMouseUp={stopDragging}
      onMouseMove={handleMouseMove}
    >
      <div className="blockchain-scroll-inner">

        {/* Pending blocks — oldest left, newest right (closest to arrow) */}
        <div className="block-row block-row-pending">
          {pending.length === 0 && (
            <div className="block-empty"><span>Mempool empty</span></div>
          )}
          {[...pending].reverse().map((b) => (
            <PendingBlock key={b.index} block={b} />
          ))}
        </div>

        {/* Arrow */}
        <div className="chain-arrow" ref={arrowRef}>
          <svg viewBox="0 0 72 36" fill="none">
            <line x1="0" y1="18" x2="62" y2="18"
              stroke="#ff6600" strokeWidth="2.5" strokeLinecap="round"/>
            <polyline points="50,6 64,18 50,30"
              stroke="#ff6600" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="chain-arrow-label">confirmed</span>
        </div>

        {/* Confirmed blocks — newest left, older right */}
        <div className="block-row block-row-confirmed">
          {recent.map((b, i) => (
            <ConfirmedBlock 
              key={b.height} 
              block={b} 
              isLatest={i === 0} 
              onClick={handleBlockClick} 
            />
          ))}
        </div>

      </div>
    </div>
  );
}

// ── Pending block ─────────────────────────────────────────────────────────────

function PendingBlock({ block }: { block: MempoolBlock }) {
  const fill  = Math.min(100, (block.blockSize / BLOCK_CAP) * 100);
  const color = feeRateColor(block.medianFee);
  const [r, g, b] = hexToRgb(color);
  const gradient = `linear-gradient(to top, rgba(${r},${g},${b},0.82) 0%, rgba(${r},${g},${b},0.40) 100%)`;

  return (
    <div
      className="xblock xblock-pending"
      title={pendingTip(block)}
      draggable="false"
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="xblock-face">
        <div className="xblock-fill" style={{ background: gradient, height: `${fill}%` }} />
        <div className="xblock-content">
          {block.nTx === 0
            ? <span className="xblock-empty-label">Empty</span>
            : <>
                <div className="xblock-fee" style={{ color: feeRateColor(block.medianFee) }}>
                  {formatFeeRate(block.medianFee)}
                </div>
                <div className="xblock-txcount">{block.nTx.toLocaleString()} transactions</div>
                <div className="xblock-size">{formatBytes(block.blockSize)}</div>
              </>
          }
        </div>
        <div className="xblock-label xblock-label-pending">
          ~ {(block.index + 1) * 2} mins
        </div>
      </div>
    </div>
  );
}

function pendingTip(b: MempoolBlock) {
  return [
    `~ ${(b.index + 1) * 2} mins`,
    `${b.nTx.toLocaleString()} transactions`,
    `Size: ${formatBytes(b.blockSize)}`,
    `Median fee: ${formatFeeRate(b.medianFee)}`,
    `Total fees: ${piconeroToXMR(b.totalFees, 6)} XMR`,
  ].join('\n');
}

// ── Confirmed block ───────────────────────────────────────────────────────────

function ConfirmedBlock({ 
  block, 
  isLatest, 
  onClick 
}: { 
  block: RecentBlock; 
  isLatest: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const fill = Math.min(100, (block.size / BLOCK_CAP) * 100);
  const fillGrad = `linear-gradient(to top,
    rgba(255,102,0,0.80) 0%,
    rgba(255,102,0,0.35) 60%,
    rgba(255,102,0,0.08) 100%)`;

  return (
    <Link
      to={`/block/${block.height}`}
      className={`xblock xblock-confirmed${isLatest ? ' xblock-latest' : ''}`}
      title={confirmedTip(block)}
      onClick={onClick}
      draggable="false"
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="xblock-face">
        <div className="xblock-fill" style={{ background: fillGrad, height: `${fill}%` }} />
        
        {block.miner === 'p2pool' && (
          <div className="xblock-miner-tag-overlay" title="Mined by P2Pool" />
        )}

        <div className="xblock-content">
          <div className={`xblock-height${isLatest ? ' is-latest' : ''}`}>
            {block.height.toLocaleString()}
          </div>
          <div className="xblock-txcount">{block.nTx.toLocaleString()} transactions</div>
          <div className="xblock-size">{formatBytes(block.size)}</div>
          <div className="xblock-time">{timeAgo(block.timestamp)}</div>
        </div>
        <div className="xblock-label xblock-label-confirmed">
          {piconeroToXMR(block.reward, 3)} XMR
        </div>
      </div>
    </Link>
  );
}

function confirmedTip(b: RecentBlock) {
  return [
    `Block #${b.height.toLocaleString()}`,
    `${b.nTx.toLocaleString()} transactions`,
    `Size: ${formatBytes(b.size)}`,
    `Reward: ${piconeroToXMR(b.reward, 4)} XMR`,
    timeAgo(b.timestamp),
  ].join('\n');
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
