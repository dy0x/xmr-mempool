import type { AppState } from '../types';
import StatsBar from './StatsBar';
import MempoolBlocks from './MempoolBlocks';
import FeesBox from './FeesBox';
import BlocksList from './BlocksList';
import FeeChart from './FeeChart';

interface Props {
  state: AppState;
  selectedCurrency?: string;
  xmrPrice?: number;
  priceChange24h?: number | null;
  priceFetchedAt?: number;
}

export default function Dashboard({ state, selectedCurrency, xmrPrice, priceChange24h, priceFetchedAt }: Props) {
  const { mempoolBlocks, recentBlocks, mempoolInfo, fees, networkStats, loading } = state;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div className="loading-text">Connecting to Monero node…</div>
        <div className="loading-sub">Fetching mempool and recent blocks</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Stats bar */}
      <StatsBar 
        mempoolInfo={mempoolInfo} 
        networkStats={networkStats} 
        xmrPrice={xmrPrice}
        selectedCurrency={selectedCurrency}
        priceChange24h={priceChange24h}
        priceFetchedAt={priceFetchedAt}
      />

      {/* Main visualisation: mempool ←→ blockchain */}
      <section className="blockchain-section">
        <MempoolBlocks mempoolBlocks={mempoolBlocks} recentBlocks={recentBlocks} />
      </section>

      {/* Bottom row: fee box + info */}
      <section className="bottom-row">
        <FeesBox fees={fees} selectedCurrency={selectedCurrency} xmrPrice={xmrPrice} mempoolBlocks={mempoolBlocks} />
        <MempoolSummary mempoolInfo={mempoolInfo} networkStats={networkStats} />
      </section>

      {/* Fee rate chart */}
      <section className="chart-section">
        <FeeChart />
      </section>

      {/* Block table */}
      <section className="blocks-section">
        <BlocksList recentBlocks={recentBlocks} />
      </section>
    </div>
  );
}

// ── Mempool summary card ──────────────────────────────────────────────────────

import type { MempoolInfo, NetworkStats } from '../types';
import { formatBytes, piconeroToXMR } from '../types';

function MempoolSummary({
  mempoolInfo,
  networkStats,
}: {
  mempoolInfo: MempoolInfo | null;
  networkStats: NetworkStats | null;
}) {
  return (
    <div className="mempool-summary">
      <div className="summary-title">Mempool</div>
      <div className="summary-grid">
        <SummaryItem label="Pending transactions" value={mempoolInfo?.count.toLocaleString() ?? '—'} />
        <SummaryItem
          label="Total size"
          value={mempoolInfo ? formatBytes(mempoolInfo.vsize) : '—'}
        />
        <SummaryItem
          label="Total fees"
          value={mempoolInfo ? `${piconeroToXMR(mempoolInfo.totalFee, 6)} XMR` : '—'}
        />
        <SummaryItem
          label="Min fee rate"
          value={
            mempoolInfo && mempoolInfo.memPoolMinFee > 0
              ? `${mempoolInfo.memPoolMinFee.toLocaleString()} ρ/B`
              : '—'
          }
        />
        <SummaryItem
          label="Block time target"
          value={networkStats ? `${networkStats.blockTarget}s` : '120s'}
        />
        <SummaryItem
          label="Total transactions"
          value={networkStats ? networkStats.txCount.toLocaleString() : '—'}
        />
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  );
}
