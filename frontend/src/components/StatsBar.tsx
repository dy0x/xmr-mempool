import type { MempoolInfo, NetworkStats } from '../types';
import { formatBytes, formatHashrate, formatDifficulty } from '../types';

import { CURRENCIES } from './CurrencyBar';

interface Props {
  mempoolInfo: MempoolInfo | null;
  networkStats: NetworkStats | null;
  xmrPrice?: number;
  selectedCurrency?: string;
  priceChange24h?: number | null;
}

export default function StatsBar({ mempoolInfo, networkStats, xmrPrice, selectedCurrency, priceChange24h }: Props) {
  const cur = CURRENCIES.find(c => c.code === selectedCurrency) ?? CURRENCIES[0];
  const isUp = (priceChange24h ?? 0) >= 0;
  
  return (
    <div className="stats-bar">
      <Stat
        label="XMR Price"
        value={xmrPrice != null ? `${cur.symbol}${xmrPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        sub={priceChange24h != null ? `${isUp ? '▲' : '▼'} ${Math.abs(priceChange24h).toFixed(2)}%` : undefined}
        subColor={priceChange24h != null ? (isUp ? '#3bd16f' : '#faad14') : undefined}
      />
      <Stat
        label="Unconfirmed TXs"
        value={mempoolInfo ? mempoolInfo.count.toLocaleString() : '—'}
        sub={mempoolInfo ? formatBytes(mempoolInfo.vsize) : ''}
      />
      <Stat
        label="Network Height"
        value={networkStats ? networkStats.height.toLocaleString() : '—'}
        sub="blocks"
      />
      <Stat
        label="Difficulty"
        value={networkStats ? formatDifficulty(networkStats.difficulty) : '—'}
        sub="RandomX"
      />
      <Stat
        label="Hashrate"
        value={networkStats ? formatHashrate(networkStats.hashrate) : '—'}
        sub="estimated"
      />
      <Stat
        label="Version"
        value={networkStats?.version ?? '—'}
        sub="monerod"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="stat-item">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && (
        <div className="stat-sub" style={subColor ? { color: subColor } : {}}>
          {sub}
        </div>
      )}
    </div>
  );
}
