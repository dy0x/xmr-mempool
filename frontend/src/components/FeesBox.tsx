import type { RecommendedFees } from '../types';
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
}

export default function FeesBox({ fees, selectedCurrency, xmrPrice }: Props) {
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
    if (feeFiat < 0.01)   return `${sym}${feeFiat.toFixed(4)}`;
    return `${sym}${feeFiat.toFixed(3)}`;
  }

  return (
    <div className="fees-box">
      <div className="fees-title">Fee Estimates</div>
      <div className="fees-grid">
        <FeeCard
          label="No Priority"
          sublabel="~10+ min"
          fee={fees?.slowFee ?? null}
          color="#3bd16f"
          fiat={feeToFiat(fees?.slowFee ?? null)}
        />
        <FeeCard
          label="Normal"
          sublabel="~2–4 min"
          fee={fees?.normalFee ?? null}
          color="#faad14"
          fiat={feeToFiat(fees?.normalFee ?? null)}
        />
        <FeeCard
          label="High Priority"
          sublabel="Next block"
          fee={fees?.fastFee ?? null}
          color="#ff6600"
          fiat={feeToFiat(fees?.fastFee ?? null)}
        />
      </div>

      {/* Piconero explanation */}
      <div className="fees-pico-note">
        <span className="fees-pico-rho">ρ</span> = piconero = one
        <strong> trillionth</strong> of 1 XMR
        &nbsp;(1 XMR = 1,000,000,000,000 ρ).
        Fiat estimates assume a typical ~{TYPICAL_TX_BYTES.toLocaleString()} byte transaction.
      </div>

      <div className="fees-note">
        Monero targets one block every 2 minutes.
        Fees are dynamic — higher fee = faster inclusion.
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
        <div className="fee-fiat">{fiat}</div>
      )}
    </div>
  );
}
