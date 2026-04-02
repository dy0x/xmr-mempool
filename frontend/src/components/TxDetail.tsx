import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { piconeroToXMR, timeAgo } from '../types';

interface TxData {
  txid: string;
  inPool: boolean;
  blockHeight: number;
  blockTimestamp: number;
  confirmations: number;
  doubleSpendSeen: boolean;
  version?: number;
  unlock_time?: number;
  vin?: Array<{ key: { k_image: string; key_offsets: number[] } }>;
  vout?: Array<{ amount: number; target: { tagged_key?: { key: string }; key?: string } }>;
  rct_signatures?: { txnFee: number };
  extra?: number[];
}

export default function TxDetail() {
  const { txid } = useParams<{ txid: string }>();
  const [tx, setTx] = useState<TxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!txid) return;
    setLoading(true);
    fetch(`/api/v1/tx/${txid}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data: TxData) => { setTx(data); setLoading(false); })
      .catch((err: unknown) => { setError(String(err)); setLoading(false); });
  }, [txid]);

  if (loading) return <div className="detail-loading">Looking up transaction…</div>;
  if (error) return <div className="detail-error">Error: {error}</div>;
  if (!tx) return null;

  const fee = tx.rct_signatures?.txnFee ?? 0;
  const outputCount = tx.vout?.length ?? 0;
  const inputCount = tx.vin?.length ?? 0;

  return (
    <div className="detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">Dashboard</Link>{' '}
        {tx.blockHeight > 0 && (
          <>
            › <Link to={`/block/${tx.blockHeight}`}>Block #{tx.blockHeight.toLocaleString()}</Link>
          </>
        )}{' '}
        › Transaction
      </div>

      <h1 className="detail-title">Transaction</h1>

      <div className={`tx-status-badge ${tx.inPool ? 'badge-pending' : 'badge-confirmed'}`}>
        {tx.inPool ? '⏳ Unconfirmed (in mempool)' : `✓ Confirmed — ${tx.confirmations.toLocaleString()} confirmation${tx.confirmations !== 1 ? 's' : ''}`}
      </div>
      {tx.doubleSpendSeen && (
        <div className="tx-status-badge badge-warning">⚠ Double spend detected</div>
      )}

      <div className="detail-card">
        <DetailRow label="Transaction ID" value={tx.txid} mono />
        {tx.blockHeight > 0 && (
          <DetailRow
            label="Block"
            value={tx.blockHeight.toLocaleString()}
            link={`/block/${tx.blockHeight}`}
          />
        )}
        {tx.blockTimestamp > 0 && (
          <DetailRow
            label="Time"
            value={`${new Date(tx.blockTimestamp * 1000).toUTCString()} (${timeAgo(tx.blockTimestamp)})`}
          />
        )}
        {fee > 0 && (
          <DetailRow label="Fee" value={`${piconeroToXMR(fee, 8)} XMR`} />
        )}
        <DetailRow label="Inputs" value={inputCount.toLocaleString()} />
        <DetailRow label="Outputs" value={outputCount.toLocaleString()} />
        {tx.version !== undefined && (
          <DetailRow label="Version" value={String(tx.version)} />
        )}
      </div>

      <div className="tx-privacy-note">
        <span className="privacy-icon">🔒</span>
        Monero uses RingCT — amounts and sender addresses are hidden on-chain.
        Only the recipient (with their private view key) can decode the amounts.
      </div>

      {/* Ring members */}
      {inputCount > 0 && (
        <div className="detail-txlist">
          <h2>Inputs ({inputCount}) — Ring Members</h2>
          <p className="ring-note">
            Each input contains a ring of possible sources (ring size = {(tx.vin?.[0]?.key?.key_offsets?.length ?? 11).toLocaleString()}).
            True source is hidden among decoys.
          </p>
          {(tx.vin ?? []).slice(0, 5).map((vin, i) => (
            <div key={i} className="ring-item">
              <div className="ring-item-label">Input {i + 1}</div>
              <div className="mono ring-item-img">Key image: {vin.key?.k_image ?? 'N/A'}</div>
            </div>
          ))}
          {inputCount > 5 && <div className="more-hint">…and {inputCount - 5} more inputs</div>}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className={`detail-row-value ${mono ? 'mono' : ''}`}>
        {link ? <Link to={link}>{value}</Link> : value}
      </div>
    </div>
  );
}
