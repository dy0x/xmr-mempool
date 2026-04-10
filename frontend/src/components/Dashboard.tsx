import type { AppState } from '../types';
import StatsBar from './StatsBar';
import MempoolBlocks from './MempoolBlocks';
import FeesBox from './FeesBox';
import MempoolTxList from './MempoolTxList';
import FeeChart from './FeeChart';

import type { RecentBlock, MempoolInfo, NetworkStats } from '../types';
import { formatBytes, piconeroToXMR, formatFeeRate } from '../types';

interface Props {
  state: AppState;
  selectedCurrency?: string;
  xmrPrice?: number;
  priceChange24h?: number | null;
  priceFetchedAt?: number;
  onAppendBlocks: (blocks: RecentBlock[]) => void;
}

export default function Dashboard({ state, selectedCurrency, xmrPrice, priceChange24h, priceFetchedAt, onAppendBlocks }: Props) {
  const { mempoolBlocks, recentBlocks, mempoolInfo, fees, networkStats, loading } = state;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div className="loading-text">Connecting to Monero node…</div>
        <div className="loading-sub">Fetching txpool and recent blocks</div>
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
        <MempoolBlocks mempoolBlocks={mempoolBlocks} recentBlocks={recentBlocks} onAppendBlocks={onAppendBlocks} />
      </section>

      {/* Fee estimates + mempool stats */}
      <section className="bottom-row">
        <FeesBox fees={fees} selectedCurrency={selectedCurrency} xmrPrice={xmrPrice} mempoolBlocks={mempoolBlocks} />
        <MempoolSummary mempoolInfo={mempoolInfo} networkStats={networkStats} />
      </section>

      {/* Fee chart + live tx feed side by side */}
      <section className="chart-tx-row">
        <FeeChart xmrPrice={xmrPrice} selectedCurrency={selectedCurrency} />
        <MempoolTxList />
      </section>
    </div>
  );
}

// ── Mempool summary card ──────────────────────────────────────────────────────

function MempoolSummary({
  mempoolInfo,
  networkStats,
}: {
  mempoolInfo: MempoolInfo | null;
  networkStats: NetworkStats | null;
}) {
  return (
    <div className="mempool-summary">
      <div className="summary-title">Txpool</div>
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
              ? formatFeeRate(mempoolInfo.memPoolMinFee)
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
