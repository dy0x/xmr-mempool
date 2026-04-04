/**
 * FeeChart — historical median fee rate chart.
 *
 * Single filled area chart, colour-coded by fee level (green → orange → red),
 * similar to mempool.space. Shows the last 2 hours of data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface FeeSnapshot {
  ts: number;
  slowFee: number;
  normalFee: number;
  fastFee: number;
  txPoolSize: number;
}

/** Compute median fee from a snapshot */
function medianFee(s: FeeSnapshot): number {
  return s.normalFee;
}

/** Map a fee rate (piconero/byte) to a CSS colour. */
function feeColor(v: number): string {
  // Thresholds tuned to typical XMR fee ranges (piconero/byte)
  if (v <= 0) return '#3bd16f'; // green  — zero/empty
  if (v < 80_000) return '#3bd16f'; // green  — cheap
  if (v < 200_000) return '#faad14'; // yellow — normal
  if (v < 500_000) return '#ff7535'; // orange — busy
  return '#e84142';                   // red    — congested
}

interface FeeChartProps {
  xmrPrice?: number;
  selectedCurrency?: string;
}

export default function FeeChart({ xmrPrice, selectedCurrency }: FeeChartProps) {
  const [data, setData] = useState<FeeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; snap: FeeSnapshot } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 160 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Observe the body div directly — this is the stable element that always exists,
  // so the observer never loses track when ChartSVG conditionally mounts/unmounts.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setContainerSize({ width, height });
      }
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }
    return () => observer.disconnect();
  }, []);

  const fetchData = useCallback(() => {
    fetch(`/api/v1/statistics/fees?window=2h`)
      .then(r => r.json())
      .then((d: FeeSnapshot[]) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
    timerRef.current = setInterval(fetchData, 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  return (
    <div className="fee-chart-card">
      <div className="fee-chart-header">
        <div className="fee-chart-title">
          Minimum Fee Rate per Block
        </div>
        <div className="fee-chart-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#3bd16f' }} />Low</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#faad14' }} />Normal</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#ff7535' }} />Busy</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#e84142' }} />Congested</span>
        </div>
      </div>

      <div className="fee-chart-body" ref={bodyRef}>
        {loading ? (
          <div className="fee-chart-loading">Loading fee history…</div>
        ) : data.length < 2 ? (
          <div className="fee-chart-loading">
            Collecting data — check back in a moment.
          </div>
        ) : (
          <ChartSVG
            data={data}
            width={containerSize.width}
            height={containerSize.height}
            tooltip={tooltip}
            onTooltip={setTooltip}
            xmrPrice={xmrPrice}
            selectedCurrency={selectedCurrency}
          />
        )}
      </div>
    </div>
  );
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────

interface ChartSVGProps {
  data: FeeSnapshot[];
  width: number;
  height: number;
  tooltip: { x: number; y: number; snap: FeeSnapshot } | null;
  onTooltip: (t: { x: number; y: number; snap: FeeSnapshot } | null) => void;
  xmrPrice?: number;
  selectedCurrency?: string;
}

// Approximate size of a typical 2-in/2-out RingCT transaction (bytes)
const TYPICAL_TX_BYTES = 1400;

function ChartSVG({ data, width, height, tooltip, onTooltip, xmrPrice, selectedCurrency }: ChartSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const W = width, H = height;
  const PAD = { top: 10, right: 32, bottom: 28, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const fees = data.map(medianFee).filter(v => v > 0);
  const sorted = [...fees].sort((a, b) => a - b);
  // Use P95 as the scale ceiling so a single high-fee outlier doesn't crush the chart
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 1;
  const maxFee = (p95 * 1.25) || 1;
  const minFee = Math.max(0, (sorted[0] ?? 0) * 0.85);

  const t0 = data[0].ts;
  const t1 = data[data.length - 1].ts;
  const tRange = t1 - t0 || 1;

  const toX = (ts: number) => PAD.left + ((ts - t0) / tRange) * cW;
  const toY = (v: number) => {
    const clamped = Math.max(minFee, Math.min(v, maxFee));
    return PAD.top + cH - ((clamped - minFee) / (maxFee - minFee)) * cH;
  };

  // Build area path
  const pts = data.map(d => ({ x: toX(d.ts), y: toY(medianFee(d)), fee: medianFee(d) }));
  const baseY = PAD.top + cH;

  // Line path (M + L segments)
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Area path (close down to baseline)
  const areaPath = [
    ...pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${baseY}`,
    `L ${pts[0].x} ${baseY}`,
    'Z',
  ].join(' ');

  // Y-axis ticks
  const TICKS = 4;
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const val = minFee + (i / TICKS) * (maxFee - minFee);
    return { val, y: toY(val) };
  });

  // X-axis ticks
  const xTicks = Array.from({ length: 5 }, (_, i) => {
    const ts = t0 + (i / 4) * tRange;
    return { ts, x: toX(ts) };
  });

  const formatFeeShort = (v: number): string => {
    if (v <= 0) return '0';
    const xmrPerKb = (v * 1024) / 1e12;
    return xmrPerKb.toFixed(6).replace(/\.?0+$/, '');
  };

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Current (latest) colour for line and area
  const currentFee = fees[fees.length - 1] ?? 0;
  const lineColor = feeColor(currentFee);

  // Build a <linearGradient> that maps from left-colour to right-colour along the line
  // For simplicity we use one gradient per segment coloured by fee at that point
  const gradientId = 'fee-grad';

  // Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const chartX = svgX - PAD.left;
    const fraction = Math.max(0, Math.min(1, chartX / cW));
    const targetTs = t0 + fraction * tRange;
    let best = data[0];
    let bestDist = Infinity;
    for (const d of data) {
      const dist = Math.abs(d.ts - targetTs);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    onTooltip({ x: toX(best.ts), y: e.clientY - rect.top, snap: best });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onTooltip(null)}
      >
        <defs>
          {/* Horizontal gradient coloured by fee level at each stop */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            {pts.map((p, i) => (
              <stop
                key={i}
                offset={`${((p.x - PAD.left) / cW) * 100}%`}
                stopColor={feeColor(p.fee)}
              />
            ))}
          </linearGradient>
          <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <g key={val}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end"
              fontSize="9" fill="rgba(160,160,160,0.7)">
              {formatFeeShort(val)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xTicks.map(({ ts, x }) => (
          <text key={ts} x={x} y={H - 6} textAnchor="middle"
            fontSize="9" fill="rgba(160,160,160,0.7)">
            {formatTime(ts)}
          </text>
        ))}

        {/* Y-axis unit label */}
        <text
          x={8}
          y={PAD.top + cH / 2}
          textAnchor="middle"
          fontSize="8"
          fill="rgba(160,160,160,0.5)"
          transform={`rotate(-90, 8, ${PAD.top + cH / 2})`}
        >
          XMR/kB
        </text>

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + cH} x2={PAD.left + cW} y2={PAD.top + cH}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Filled area */}
        <path d={areaPath} fill={`url(#${gradientId}-area)`} />

        {/* Main line — coloured by fee level via gradient */}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PAD.top}
              x2={tooltip.x} y2={PAD.top + cH}
              stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3"
            />
            <circle
              cx={tooltip.x}
              cy={toY(medianFee(tooltip.snap))}
              r="4"
              fill={feeColor(medianFee(tooltip.snap))}
              stroke="#1d1f2e"
              strokeWidth="1.5"
            />
          </>
        )}
      </svg>

      {/* Tooltip popup */}
      {tooltip && <TooltipPopup
        snap={tooltip.snap}
        x={tooltip.x}
        W={W}
        xmrPrice={xmrPrice}
        selectedCurrency={selectedCurrency}
        formatTime={formatTime}
        formatFeeShort={formatFeeShort}
      />}
    </div>
  );
}

function TooltipPopup({ snap, x, W, xmrPrice, selectedCurrency, formatTime, formatFeeShort }: {
  snap: FeeSnapshot;
  x: number;
  W: number;
  xmrPrice?: number;
  selectedCurrency?: string;
  formatTime: (ts: number) => string;
  formatFeeShort: (v: number) => string;
}) {
  const fee = medianFee(snap);
  const typicalXMR = fee * TYPICAL_TX_BYTES / 1e12;
  const typicalFiat = xmrPrice != null ? typicalXMR * xmrPrice : null;
  const currencyCode = (selectedCurrency ?? 'usd').toUpperCase();

  return (
    <div
      className="chart-tooltip"
      style={{ left: Math.min(x / W * 100, 75) + '%', top: '8px' }}
    >
      <div className="chart-tooltip-time">{formatTime(snap.ts)}</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-dot" style={{ background: feeColor(fee) }} />
        <span className="chart-tooltip-label">Min fee:</span>
        <span className="chart-tooltip-val">{((fee * 1024) / 1e12).toFixed(7).replace(/\.?0+$/, '')} XMR/kB</span>
      </div>
      <div className="chart-tooltip-row chart-tooltip-conversion">
        <span className="chart-tooltip-label">Typical tx:</span>
        <span className="chart-tooltip-val">{typicalXMR.toFixed(6)} XMR</span>
      </div>
      {typicalFiat != null && (
        <div className="chart-tooltip-row chart-tooltip-conversion">
          <span className="chart-tooltip-label" />
          <span className="chart-tooltip-val">
            {typicalFiat < 0.01 ? typicalFiat.toFixed(4) : typicalFiat.toFixed(2)} {currencyCode}
          </span>
        </div>
      )}
      <div className="chart-tooltip-pool">Pool: {snap.txPoolSize.toLocaleString()} txs</div>
    </div>
  );
}
