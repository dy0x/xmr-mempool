import type { RecommendedFees } from '../types';
import { formatFeeRate } from '../types';

interface Props {
  fees: RecommendedFees | null;
}

export default function FeesBox({ fees }: Props) {
  return (
    <div className="fees-box">
      <div className="fees-title">Fee Estimates</div>
      <div className="fees-grid">
        <FeeCard
          label="No Priority"
          sublabel="~10+ min"
          fee={fees?.slowFee ?? null}
          color="#3bd16f"
        />
        <FeeCard
          label="Normal"
          sublabel="~2–4 min"
          fee={fees?.normalFee ?? null}
          color="#faad14"
        />
        <FeeCard
          label="High Priority"
          sublabel="Next block"
          fee={fees?.fastFee ?? null}
          color="#ff6600"
        />
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
}: {
  label: string;
  sublabel: string;
  fee: number | null;
  color: string;
}) {
  return (
    <div className="fee-card">
      <div className="fee-dot" style={{ background: color }} />
      <div className="fee-label">{label}</div>
      <div className="fee-sublabel">{sublabel}</div>
      <div className="fee-value" style={{ color }}>
        {fee !== null ? formatFeeRate(fee) : '—'}
      </div>
    </div>
  );
}
