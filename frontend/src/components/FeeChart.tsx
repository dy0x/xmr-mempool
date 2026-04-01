/**
 * FeeChart — historical fee rate chart, like mempool.space's bottom graph.
 *
 * Shows slowFee, normalFee, fastFee over a selectable time window.
 * Rendered as an SVG area chart with no external charting library.
 */

import { useEffect, useState, useRef, useCallback } from 'react';

interface FeeSnapshot {
  ts: number;
  slowFee: number;
  normalFee: number;
  fastFee: number;
  txPoolSize: number;
}

type Window = '2h' | '24h' | '1w';

const WINDOW_LABELS: Record<Window, string> = {
  '2h':  '2 hours',
  '24h': '24 hours',
  '1w':  '1 week',
};

const SERIES = [
  { key: 'fastFee'   as const, label: 'Fast',   color: '#ff6600' },
  { key: 'normalFee' as const, label: 'Normal',  color: '#faad14' },
  { key: 'slowFee'   as const, label: 'Slow',    color: '#3bd16f' },
];

export default function FeeChart() {
  const [window, setWindow]   = useState<Window>('2h');
  const [data, setData]       = useState<FeeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; snap: FeeSnapshot } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null) as React.RefObject<SVGSVGElement>;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback((win: Window) => {
    fetch(`/api/v1/statistics/fees?window=${win}`)
      .then(r => r.json())
      .then((d: FeeSnapshot[]) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(window);
    timerRef.current = setInterval(() => fetchData(window), 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [window, fetchData]);

  return (
    <div className="fee-chart-card">
      <div className="fee-chart-header">
        <div className="fee-chart-title">Fee Rate History</div>

        {/* Legend */}
        <div className="fee-chart-legend">
          {SERIES.map(s => (
            <span key={s.key} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>

        {/* Window selector */}
        <div className="fee-chart-windows">
          {(Object.keys(WINDOW_LABELS) as Window[]).map(w => (
            <button
              key={w}
              className={`window-btn ${window === w ? 'window-btn-active' : ''}`}
              onClick={() => setWindow(w)}
            >
              {w}
            </button>
          ))}
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
  const W = 900, H = 160;
  const PAD = { top: 10, right: 16, bottom: 28, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  const allFees = data.flatMap(d => [d.slowFee, d.normalFee, d.fastFee]).filter(v => v > 0);
  const maxFee  = (Math.max(...allFees) * 1.12) || 1;
  // Start Y axis 10% below the lowest fee so all lines stay comfortably visible
  const minFee  = Math.max(0, Math.min(...allFees) * 0.88);

  const t0 = data[0].ts;
  const t1 = data[data.length - 1].ts;
  const tRange = t1 - t0 || 1;

  const toX = (ts: number) => PAD.left + ((ts - t0) / tRange) * cW;
  const toY = (v: number)  => PAD.top  + cH - ((v - minFee) / (maxFee - minFee)) * cH;

  const buildPath = (key: keyof FeeSnapshot) =>
    data.map((d, i) => {
      const x = toX(d.ts);
      const y = toY(d[key] as number);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

  // Y-axis ticks
  const TICKS = 4;
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const val = minFee + (i / TICKS) * (maxFee - minFee);
    return { val, y: toY(val) };
  });

  // X-axis ticks (5 evenly spaced)
  const xTicks = Array.from({ length: 5 }, (_, i) => {
    const ts = t0 + (i / 4) * tRange;
    return { ts, x: toX(ts) };
  });

  const formatFeeShort = (v: number): string => {
    // piconero/byte → millinero/byte
    const m = v / 1e9;
    if (m < 0.001) return `${Math.round(v / 1000)}K ρ`;
    if (m < 1) return `${m.toFixed(2)}m`;
    return `${m.toFixed(1)}m`;
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Mouse hover → nearest point
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const chartX = svgX - PAD.left;
    const fraction = Math.max(0, Math.min(1, chartX / cW));
    const targetTs = t0 + fraction * tRange;
    // Find nearest snapshot
    let best = data[0];
    let bestDist = Infinity;
    for (const d of data) {
      const dist = Math.abs(d.ts - targetTs);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    onTooltip({ x: toX(best.ts), y: e.clientY - rect.top, snap: best });
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onTooltip(null)}
      >
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

        {/* Axis line */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        <line x1={PAD.left} y1={PAD.top + cH} x2={PAD.left + cW} y2={PAD.top + cH}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>

        {/* Lines only — no area fill */}
        {SERIES.map(s => (
          <path
            key={s.key}
            d={buildPath(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PAD.top}
              x2={tooltip.x} y2={PAD.top + cH}
              stroke="rgba(255,102,0,0.5)" strokeWidth="1" strokeDasharray="3 3"
            />
            {SERIES.map(s => (
              <circle
                key={s.key}
                cx={tooltip.x}
                cy={toY(tooltip.snap[s.key] as number)}
                r="3.5"
                fill={s.color}
                stroke="#1d1f2e"
                strokeWidth="1.5"
              />
            ))}
          </>
        )}
      </svg>

      {/* Tooltip popup */}
      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(tooltip.x / 900 * 100, 75) + '%',
            top: '8px',
          }}
        >
          <div className="chart-tooltip-time">{formatTime(tooltip.snap.ts)}</div>
          {SERIES.map(s => (
            <div key={s.key} className="chart-tooltip-row">
              <span className="chart-tooltip-dot" style={{ background: s.color }} />
              <span className="chart-tooltip-label">{s.label}:</span>
              <span className="chart-tooltip-val">{formatFeeShort(tooltip.snap[s.key] as number)}</span>
            </div>
          ))}
          <div className="chart-tooltip-pool">Pool: {tooltip.snap.txPoolSize.toLocaleString()} txs</div>
        </div>
      )}
    </div>
  );
}
