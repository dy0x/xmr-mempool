import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { timeAgo } from '../types';
import XMRAmount from './XMRAmount';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RingMember { index: number; height: number; key: string }

interface TxData {
  txid: string;
  inPool: boolean;
  blockHeight: number;
  blockTimestamp: number;
  confirmations: number;
  doubleSpendSeen: boolean;
  // enriched by backend
  size?: number;
  fee?: number;
  feePerKb?: number;
  txPublicKey?: string;
  paymentId?: string;
  extraHex?: string;
  ringCtType?: number;
  ringMembers?: RingMember[][];
  // from as_json
  version?: number;
  unlock_time?: number;
  vin?: Array<{ key: { k_image: string; key_offsets: number[] } }>;
  vout?: Array<{ amount: number; target: { tagged_key?: { key: string }; key?: string } }>;
  extra?: number[];
  rct_signatures?: { txnFee?: number; type?: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RCT_TYPE: Record<number, string> = {
  0: 'None (pre-RCT)',
  1: 'Full (deprecated)',
  2: 'Simple (deprecated)',
  3: 'Bulletproof',
  4: 'Bulletproof2',
  5: 'CLSAG',
  6: 'Bulletproof+',
};

function outputKey(out: TxData['vout'][number]): string {
  return out.target?.tagged_key?.key ?? out.target?.key ?? '—';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TxDetail() {
  const { txid } = useParams<{ txid: string }>();
  const [tx, setTx] = useState<TxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!txid) return;
    setLoading(true);
    setTx(null);
    setError(null);
    fetch(`/api/v1/tx/${txid}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: TxData) => { setTx(data); setLoading(false); })
      .catch((err: unknown) => { setError(String(err)); setLoading(false); });
  }, [txid]);

  if (loading) return <div className="detail-loading">Looking up transaction…</div>;
  if (error)   return <div className="detail-error">Error: {error}</div>;
  if (!tx)     return null;

  const fee          = tx.fee ?? tx.rct_signatures?.txnFee ?? 0;
  const ringCtType   = tx.ringCtType ?? tx.rct_signatures?.type;
  const inputCount   = tx.vin?.length ?? 0;
  const outputCount  = tx.vout?.length ?? 0;
  const ringSize     = tx.vin?.[0]?.key?.key_offsets?.length ?? 0;

  return (
    <div className="detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">Dashboard</Link>
        {tx.blockHeight > 0 && (
          <> › <Link to={`/block/${tx.blockHeight}`}>Block #{tx.blockHeight.toLocaleString()}</Link></>
        )}
        {' '}› Transaction
      </div>

      <h1 className="detail-title">Transaction</h1>

      <div className={`tx-status-badge ${tx.inPool ? 'badge-pending' : 'badge-confirmed'}`}>
        {tx.inPool
          ? '⏳ Unconfirmed (in mempool)'
          : `✓ Confirmed — ${tx.confirmations.toLocaleString()} confirmation${tx.confirmations !== 1 ? 's' : ''}`}
      </div>
      {tx.doubleSpendSeen && (
        <div className="tx-status-badge badge-warning">⚠ Double spend detected</div>
      )}

      {/* ── Overview ── */}
      <div className="detail-card">
        <DetailRow label="Transaction ID"   value={tx.txid} mono />
        {tx.txPublicKey && <DetailRow label="Tx public key"  value={tx.txPublicKey} mono />}
        {tx.paymentId   && <DetailRow label="Payment ID (encrypted)" value={tx.paymentId} mono />}
        {tx.blockHeight > 0 && (
          <DetailRow label="Block" value={tx.blockHeight.toLocaleString()} link={`/block/${tx.blockHeight}`} />
        )}
        {tx.blockTimestamp > 0 && (
          <DetailRow
            label="Timestamp"
            value={`${new Date(tx.blockTimestamp * 1000).toUTCString()} (${timeAgo(tx.blockTimestamp)})`}
          />
        )}
        {!tx.inPool && tx.confirmations > 0 && (
          <DetailRow label="Confirmations" value={tx.confirmations.toLocaleString()} />
        )}
        {fee > 0 && (
          <>
            <DetailRow label="Fee"         value={<XMRAmount piconero={fee} decimals={8} />} />
            {tx.feePerKb != null && tx.feePerKb > 0 && (
              <DetailRow label="Fee per kB" value={<><XMRAmount piconero={tx.feePerKb} decimals={8} noSuffix />{' XMR/kB'}</>} />
            )}
          </>
        )}
        {tx.size != null && tx.size > 0 && (
          <DetailRow label="Size" value={`${(tx.size / 1024).toFixed(4)} kB  (${tx.size.toLocaleString()} bytes)`} />
        )}
        <DetailRow label="Inputs"   value={inputCount.toString()} />
        <DetailRow label="Outputs"  value={outputCount.toString()} />
        {ringSize > 0 && <DetailRow label="Ring size" value={ringSize.toString()} />}
        {tx.version       != null && <DetailRow label="Version"    value={String(tx.version)} />}
        {ringCtType       != null && (
          <DetailRow label="RingCT type" value={`${ringCtType} — ${RCT_TYPE[ringCtType] ?? 'Unknown'}`} />
        )}
        {tx.unlock_time != null && tx.unlock_time > 0 && (
          <DetailRow label="Unlock time" value={String(tx.unlock_time)} />
        )}
        {tx.extraHex && (
          <div className="detail-row">
            <div className="detail-row-label">Extra</div>
            <div className="detail-row-value mono tx-extra-field">{tx.extraHex}</div>
          </div>
        )}
      </div>

      <div className="tx-privacy-note">
        <span className="privacy-icon">🔒</span>
        Monero uses RingCT — amounts and sender addresses are hidden on-chain.
        Only the recipient (with their private view key) can decode the output amounts.
      </div>

      {/* ── Outputs ── */}
      {outputCount > 0 && (
        <section className="detail-txlist">
          <h2>Outputs ({outputCount})</h2>
          <div className="tx-io-list">
            {(tx.vout ?? []).map((out, i) => (
              <div key={i} className="tx-io-item">
                <span className="tx-io-index">#{i}</span>
                <span className="mono tx-io-key">{outputKey(out)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Inputs ── */}
      {inputCount > 0 && (
        <section className="detail-txlist">
          <h2>Inputs ({inputCount})</h2>
          <p className="ring-note">
            Each input hides the true source among {ringSize} ring members. Key image uniquely
            identifies the spend without revealing which output was spent.
          </p>
          {(tx.vin ?? []).map((vin, i) => (
            <div key={i} className="ring-item">
              <div className="ring-item-label">Input {i + 1}</div>
              <div className="ring-item-field">
                <span className="ring-field-label">Key image</span>
                <span className="mono">{vin.key?.k_image ?? '—'}</span>
              </div>
              {tx.ringMembers?.[i] && tx.ringMembers[i].length > 0 && (
                <div className="ring-members">
                  <div className="ring-members-header">Ring members</div>
                  <table className="ring-members-table">
                    <thead>
                      <tr><th>#</th><th>Global index</th><th>Block</th><th>Output key</th></tr>
                    </thead>
                    <tbody>
                      {tx.ringMembers[i].map((m, j) => (
                        <tr key={j}>
                          <td>{j}</td>
                          <td>{m.index.toLocaleString()}</td>
                          <td><Link to={`/block/${m.height}`}>{m.height.toLocaleString()}</Link></td>
                          <td className="mono ring-key-cell">{m.key}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── DetailRow ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value, mono, link }: {
  label: string; value: React.ReactNode; mono?: boolean; link?: string;
}) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className={`detail-row-value${mono ? ' mono' : ''}`}>
        {link && typeof value === 'string' ? <Link to={link}>{value}</Link> : value}
      </div>
    </div>
  );
}
