/**
 * FeeChart — historical median fee rate chart.
 *
 * Single filled area chart, colour-coded by fee level (green → orange → red),
 * similar to mempool.space. Shows the last 2 hours of data.
 */

import { useEffect, useState, useRef, useCallback } from 'react';

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
  if (v <= 0)       return '#3bd16f'; // green  — zero/empty
  if (v < 80_000)   return '#3bd16f'; // green  — cheap
  if (v < 200_000)  return '#faad14'; // yellow — normal
  if (v < 500_000)  return '#ff7535'; // orange — busy
  return '#e84142';                   // red    — congested
}

export default function FeeChart() {
  const [data, setData] = useState<FeeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; snap: FeeSnapshot } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null) as React.RefObject<SVGSVGElement>;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          Fee Rate History <span className="fee-chart-subtitle">(last 2 hours)</span>
        </div>
        <div className="fee-chart-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#3bd16f' }} />Low</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#faad14' }} />Normal</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#ff7535' }} />Busy</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#e84142' }} />Congested</span>
        </div>
      </div>

      <div className="fee-chart-body">
        {loading ? (
          <div className="fee-chart-loading">Loading fee history…</div>
        ) : data.length < 2 ? (
          <div className="fee-chart-loading">
            Collecting data — check back in a moment.
          </div>
        ) : (
          <ChartSVG
            data={data}
            svgRef={svgRef}
            tooltip={tooltip}
            onTooltip={setTooltip}
          />
        )}
      </div>
    </div>
  );
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────

interface ChartSVGProps {
  data: FeeSnapshot[];
  svgRef: React.RefObject<SVGSVGElement>;
  tooltip: { x: number; y: number; snap: FeeSnapshot } | null;
  onTooltip: (t: { x: number; y: number; snap: FeeSnapshot } | null) => void;
}

function ChartSVG({ data, svgRef, tooltip, onTooltip }: ChartSVGProps) {
  const [size, setSize] = useState({ width: 900, height: 160 });

  useEffect(() => {
    if (!svgRef.current || !svgRef.current.parentElement) return;
    const parent = svgRef.current.parentElement;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });
    observer.observe(parent);
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, [svgRef]);

  const W = size.width, H = size.height;
  const PAD = { top: 10, right: 32, bottom: 28, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const fees = data.map(medianFee).filter(v => v > 0);
  const maxFee = (Math.max(...fees) * 1.15) || 1;
  const minFee = Math.max(0, Math.min(...fees) * 0.85);

  const t0 = data[0].ts;
  const t1 = data[data.length - 1].ts;
  const tRange = t1 - t0 || 1;

  const toX = (ts: number) => PAD.left + ((ts - t0) / tRange) * cW;
  const toY = (v: number) => PAD.top + cH - ((v - minFee) / (maxFee - minFee)) * cH;

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
    const m = v / 1e9;
    if (m < 0.001) return `${Math.round(v / 1000)}K ρ`;
    if (m < 1) return `${m.toFixed(2)}m`;
    return `${m.toFixed(1)}m`;
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
      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(tooltip.x / W * 100, 75) + '%',
            top: '8px',
          }}
        >
          <div className="chart-tooltip-time">{formatTime(tooltip.snap.ts)}</div>
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: feeColor(medianFee(tooltip.snap)) }} />
            <span className="chart-tooltip-label">Median fee:</span>
            <span className="chart-tooltip-val">{formatFeeShort(medianFee(tooltip.snap))}</span>
          </div>
          <div className="chart-tooltip-pool">Pool: {tooltip.snap.txPoolSize.toLocaleString()} transactions</div>
        </div>
      )}
    </div>
  );
}
