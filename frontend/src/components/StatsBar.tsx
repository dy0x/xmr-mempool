import type { MempoolInfo, NetworkStats } from '../types';
import { formatBytes, formatHashrate, formatDifficulty } from '../types';

interface Props {
  mempoolInfo: MempoolInfo | null;
  networkStats: NetworkStats | null;
}

export default function StatsBar({ mempoolInfo, networkStats }: Props) {
  return (
    <div className="stats-bar">
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
        label="Connections"
        value={networkStats ? networkStats.connections.toLocaleString() : '—'}
        sub={networkStats?.synchronized ? 'synced' : 'syncing…'}
        subColor={networkStats?.synchronized ? '#3bd16f' : '#faad14'}
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
