import type { RecommendedFees, MempoolBlock } from '../types';
import { formatFeeRate } from '../types';

// Typical Monero transaction size used for fiat fee estimation
const TYPICAL_TX_BYTES = 2000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$', aud: 'A$', cad: 'C$', cny: '¥', eur: '€', gbp: '£',
};

interface Props {
  fees: RecommendedFees | null;
  selectedCurrency?: string;
  xmrPrice?: number; // price of 1 XMR in selectedCurrency
  mempoolBlocks?: MempoolBlock[];
}

export default function FeesBox({ fees, selectedCurrency, xmrPrice, mempoolBlocks }: Props) {
  const sym = CURRENCY_SYMBOLS[selectedCurrency?.toLowerCase() ?? ''] ?? '';

  /**
   * Convert a fee rate (piconero/byte) → fiat for a typical ~2 KB transaction.
   * fee_xmr = (rate * bytes) / 1e12
   * fee_fiat = fee_xmr * xmrPrice
   */
  function feeToFiat(rate: number | null): string | null {
    if (rate === null || !xmrPrice || !sym) return null;
    const feeXmr = (rate * TYPICAL_TX_BYTES) / 1e12;
    const feeFiat = feeXmr * xmrPrice;
    if (feeFiat < 0.0001) return `${sym}< 0.0001`;
    if (feeFiat < 0.01) return `${sym}${feeFiat.toFixed(4)}`;
    return `${sym}${feeFiat.toFixed(3)}`;
  }

  function estimateTime(rate: number | null): string {
    if (rate === null) return '—';
    if (!mempoolBlocks || mempoolBlocks.length === 0) return 'Next block';

    let targetBlockIndex = mempoolBlocks.length;
    for (let i = 0; i < mempoolBlocks.length; i++) {
      const b = mempoolBlocks[i];
      // If there's another block after this one, this block is completely full
      const isFull = i < mempoolBlocks.length - 1;
      const minFeeInBlock = b.feeRange?.[0] ?? 0;

      if (!isFull || rate > minFeeInBlock) {
        targetBlockIndex = i;
        break;
      }
    }

    if (targetBlockIndex === 0) return 'Next block';
    const minMinutes = targetBlockIndex * 2;
    const maxMinutes = (targetBlockIndex + 1) * 2;
    return `~${minMinutes}–${maxMinutes} min`;
  }

  return (
    <div className="fees-box">
      <div className="fees-title-row">
        <div className="fees-title">Fee Estimates</div>
        <div className="fees-tooltip-btn">
          ?
          <div className="fees-tooltip-content">
            Monero targets a new block every 2 minutes. Transaction fees are dynamic, and paying a higher fee generally increases the chance your transaction will be included sooner.
          </div>
        </div>
      </div>
      <div className="fees-grid">
        <FeeCard
          label="Low Priority"
          sublabel={estimateTime(fees?.slowFee ?? null)}
          fee={fees?.slowFee ?? null}
          color="#3bd16f"
          fiat={feeToFiat(fees?.slowFee ?? null)}
        />
        <FeeCard
          label="Normal"
          sublabel={estimateTime(fees?.normalFee ?? null)}
          fee={fees?.normalFee ?? null}
          color="#faad14"
          fiat={feeToFiat(fees?.normalFee ?? null)}
        />
        <FeeCard
          label="High Priority"
          sublabel={estimateTime(fees?.fastFee ?? null)}
          fee={fees?.fastFee ?? null}
          color="#ff6600"
          fiat={feeToFiat(fees?.fastFee ?? null)}
        />
      </div>
    </div>
  );
}

function FeeCard({
  label,
  sublabel,
  fee,
  color,
  fiat,
}: {
  label: string;
  sublabel: string;
  fee: number | null;
  color: string;
  fiat: string | null;
}) {
  return (
    <div className="fee-card">
      <div className="fee-dot" style={{ background: color }} />
      <div className="fee-label">{label}</div>
      <div className="fee-sublabel">{sublabel}</div>
      <div className="fee-value" style={{ color }}>
        {fee !== null ? formatFeeRate(fee) : '—'}
      </div>
      {fiat && (
        <div className="fee-fiat">
          {fiat}
          <div className="fee-card-tooltip">Fiat estimates are based on a typical 2,000-byte transaction.</div>
        </div>
      )}
    </div>
  );
}
