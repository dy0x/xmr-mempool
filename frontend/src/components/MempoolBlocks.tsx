/**
 * MempoolBlocks — the signature visualisation.
 *
 * Layout (horizontally scrollable, auto-centred on the arrow):
 *   ← [older pending] … [pending 2] [pending 1] ──→── [latest] [older confirmed] … →
 *
 * Each block shows a gradient fill (cheap=green at bottom → expensive=red at top)
 * that rises to represent how full the block is. Flat design, no 3D clipping.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MempoolBlock, RecentBlock } from '../types';
import { feeRateColor, formatBytes, formatFeeRate, piconeroToXMR, timeAgo } from '../types';
import XMRAmount from './XMRAmount';


interface Props {
  mempoolBlocks:  MempoolBlock[];
  recentBlocks:   RecentBlock[];
  onAppendBlocks: (blocks: RecentBlock[]) => void;
}

const MAX_PENDING = 40;
const BLOCK_CAP   = 300_000; // bytes — used for fill %

export default function MempoolBlocks({ mempoolBlocks, recentBlocks, onAppendBlocks }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  const pending = mempoolBlocks.slice(0, MAX_PENDING);
  const recent  = recentBlocks; // no cap — lazily loaded history lives here

  // ── Infinite scroll ────────────────────────────────────────────────────────
  const [isFetchingMore, setIsFetchingMore]   = useState(false);
  const [reachedGenesis, setReachedGenesis]   = useState(false);
  const fetchedBottomRef = useRef<number | null>(null);

  const fetchMoreBlocks = useCallback(async () => {
    if (isFetchingMore || reachedGenesis) return;
    const oldest = recent[recent.length - 1];
    if (!oldest || oldest.height === 0) { setReachedGenesis(true); return; }
    // Guard against re-fetching the same range on rapid scroll
    if (fetchedBottomRef.current !== null && fetchedBottomRef.current <= oldest.height) return;
    fetchedBottomRef.current = oldest.height;
    setIsFetchingMore(true);
    try {
      const resp = await fetch(`/api/v1/blocks/${oldest.height}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as RecentBlock[];
      if (data.length > 0) {
        onAppendBlocks(data);
        if (data[data.length - 1].height === 0) setReachedGenesis(true);
      } else {
        setReachedGenesis(true);
      }
    } catch (err) {
      console.error('[infinite-scroll] failed to fetch blocks:', err);
      fetchedBottomRef.current = null; // allow retry on next scroll
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, reachedGenesis, recent, onAppendBlocks]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isFetchingMore || reachedGenesis) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const el = scrollRef.current;
        if (!el) return;
        const distFromRight = el.scrollWidth - el.scrollLeft - el.clientWidth;
        if (distFromRight < 600) fetchMoreBlocks();
      }, 150);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [isFetchingMore, reachedGenesis, fetchMoreBlocks]);

  // Track newly confirmed blocks to trigger slide-in animation
  const [newBlockHeight, setNewBlockHeight] = useState<number | null>(null);
  const prevHeightRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const h = recent[0]?.height;
    if (prevHeightRef.current !== undefined && h != null && h !== prevHeightRef.current) {
      setNewBlockHeight(h);
      const t = setTimeout(() => setNewBlockHeight(null), 700);
      return () => clearTimeout(t);
    }
    prevHeightRef.current = h;
  }, [recent[0]?.height]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  // When a new block arrives, smoothly scroll back to the start so it's visible
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    requestAnimationFrame(() => {
      scrollEl.scrollTo({ left: 0, behavior: newBlockHeight != null ? 'smooth' : 'instant' });
    });
  }, [recent[0]?.height]);  // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="block-empty"><span>Txpool empty</span></div>
          )}
          {[...pending].reverse().map((b) => (
            <PendingBlock key={b.index} block={b} onClick={handleBlockClick} />
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
              isNew={b.height === newBlockHeight}
              onClick={handleBlockClick}
            />
          ))}
          {isFetchingMore && (
            <div className="xblock xblock-confirmed xblock-skeleton" aria-hidden="true">
              <div className="xblock-face" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Pending block ─────────────────────────────────────────────────────────────

function PendingBlock({ block, onClick }: { block: MempoolBlock; onClick: (e: React.MouseEvent) => void }) {
  const fill  = Math.min(100, (block.blockSize / BLOCK_CAP) * 100);
  const color = feeRateColor(block.medianFee);
  const [r, g, b] = hexToRgb(color);
  const gradient = `linear-gradient(to top, rgba(${r},${g},${b},0.82) 0%, rgba(${r},${g},${b},0.40) 100%)`;

  return (
    <Link
      to={`/mempool-block/${block.index}`}
      className="xblock xblock-pending"
      title={pendingTip(block)}
      onClick={onClick}
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
    </Link>
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
  isNew,
  onClick,
}: {
  block: RecentBlock;
  isLatest: boolean;
  isNew: boolean;
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
      className={`xblock xblock-confirmed${isLatest ? ' xblock-latest' : ''}${isNew ? ' xblock-slide-in' : ''}`}
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
          <XMRAmount piconero={block.reward} decimals={3} />
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
