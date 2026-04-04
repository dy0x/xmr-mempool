import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatBytes, formatFeeRate, timeAgo } from '../types';
import XMRAmount from './XMRAmount';

interface MempoolTx {
  txid:       string;
  fee:        number;
  size:       number;
  feePerByte: number;
  receivedAt: number;
}

interface MempoolBlockData {
  index:             number;
  estimatedMinutes:  number;
  nTx:               number;
  totalFees:         number;
  totalSize:         number;
  transactions:      MempoolTx[];
}

export default function MempoolBlockDetail() {
  const { index } = useParams<{ index: string }>();
  const [data, setData]     = useState<MempoolBlockData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (index == null) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/mempool-block/${index}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: MempoolBlockData) => { setData(d); setLoading(false); })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [index]);

  if (loading) return <div className="detail-loading">Loading txpool block…</div>;
  if (error)   return <div className="detail-error">Error: {error}</div>;
  if (!data)   return null;

  const label = data.index === 0 ? 'Next block' : `~${data.estimatedMinutes} mins`;

  return (
    <div className="detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">Dashboard</Link> › Txpool block
      </div>

      <h1 className="detail-title">Pending Block #{data.index + 1}</h1>
      <div className="tx-status-badge badge-pending">⏳ Unconfirmed — {label}</div>

      {/* Summary */}
      <div className="detail-card">
        <div className="detail-row">
          <div className="detail-row-label">Transactions</div>
          <div className="detail-row-value">{data.nTx.toLocaleString()}</div>
        </div>
        <div className="detail-row">
          <div className="detail-row-label">Total size</div>
          <div className="detail-row-value">{formatBytes(data.totalSize)}</div>
        </div>
        <div className="detail-row">
          <div className="detail-row-label">Total fees</div>
          <div className="detail-row-value"><XMRAmount piconero={data.totalFees} decimals={6} /></div>
        </div>
        <div className="detail-row">
          <div className="detail-row-label">Est. confirmation</div>
          <div className="detail-row-value">{label}</div>
        </div>
      </div>

      {/* Transaction list */}
      <section className="detail-txlist">
        <h2>Transactions ({data.nTx.toLocaleString()})</h2>
        <div className="table-wrapper">
          <table className="blocks-table mempool-tx-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Fee</th>
                <th>Fee rate</th>
                <th>Size</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map(tx => (
                <tr key={tx.txid}>
                  <td>
                    <Link to={`/tx/${tx.txid}`} className="hash-link">
                      {tx.txid.slice(0, 16)}…{tx.txid.slice(-8)}
                    </Link>
                  </td>
                  <td><XMRAmount piconero={tx.fee} decimals={8} /></td>
                  <td>{formatFeeRate(tx.feePerByte)}</td>
                  <td>{formatBytes(tx.size)}</td>
                  <td>{timeAgo(tx.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
