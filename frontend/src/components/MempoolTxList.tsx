/**
 * MempoolTxList — live feed of the 7 most recent transactions.
 *
 * Shows unconfirmed (mempool) transactions first; when the pool is thin the
 * list is padded with the latest confirmed transactions so it is always full.
 * Auto-refreshes every 6 seconds. New entries slide in from the top.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes, timeAgo } from '../types';
import XMRAmount from './XMRAmount';

const ROWS = 7;

interface RecentTx {
  txid:      string;
  fee:       number;   // piconero
  size:      number;   // bytes
  timestamp: number;   // unix seconds
  confirmed: boolean;
}

interface TxRow extends RecentTx {
  isNew: boolean;
}

export default function MempoolTxList() {
  const [rows, setRows]       = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const prevTxidsRef = useRef<Set<string>>(new Set());
  const isFirstLoad  = useRef(true);

  const fetchTxs = async () => {
    try {
      const resp = await fetch('/api/v1/transactions/recent');
      if (!resp.ok) return;
      const data = (await resp.json()) as RecentTx[];
      const slice = data.slice(0, ROWS);

      const first = isFirstLoad.current;
      isFirstLoad.current = false;

      const prev = prevTxidsRef.current;
      prevTxidsRef.current = new Set(slice.map(t => t.txid));

      setRows(slice.map(t => ({ ...t, isNew: !first && !prev.has(t.txid) })));
      setLoading(false);
    } catch {
      /* keep showing last known state */
    }
  };

  useEffect(() => {
    fetchTxs();
    const id = setInterval(fetchTxs, 6_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const placeholders = loading ? ROWS : Math.max(0, ROWS - rows.length);

  return (
    <div className="mempool-tx-list">
      <div className="mempool-tx-header">
        <span className="mempool-tx-title">Recent Transactions</span>
        <span className="mempool-tx-sub">Latest {ROWS} by arrival</span>
      </div>

      <div className="table-wrapper">
        <table className="blocks-table mempool-tx-table">
          <thead>
            <tr>
              <th>TxID</th>
              <th>Fee</th>
              <th>Size</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(tx => (
              <tr key={tx.txid} className={`mempool-tx-row${tx.isNew ? ' is-new' : ''}`}>
                <td className="tx-id-cell">
                  <Link to={`/tx/${tx.txid}`} className="tx-id-link">
                    {tx.txid.slice(0, 12)}…{tx.txid.slice(-6)}
                  </Link>
                  {tx.confirmed && (
                    <span className="tx-confirmed-badge" title="Confirmed">✓</span>
                  )}
                </td>
                <td className="reward-cell">
                  <XMRAmount piconero={tx.fee} decimals={6} />
                </td>
                <td>{formatBytes(tx.size)}</td>
                <td className="age-cell">{timeAgo(tx.timestamp)}</td>
              </tr>
            ))}
            {Array.from({ length: placeholders }).map((_, i) => (
              <tr key={`ph-${i}`} className="tx-placeholder-row">
                <td /><td /><td /><td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
