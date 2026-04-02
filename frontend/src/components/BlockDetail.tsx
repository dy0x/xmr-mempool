import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { formatBytes, timeAgo } from '../types';
import XMRAmount from './XMRAmount';

interface BlockData {
  height: number;
  hash: string;
  prevHash: string;
  timestamp: number;
  size: number;
  weight: number;
  nTx: number;
  difficulty: number;
  reward: number;
  nonce: number;
  majorVersion: number;
  minorVersion: number;
  txHashes: string[];
  minerTxHash: string;
}

export default function BlockDetail() {
  const { hashOrHeight } = useParams<{ hashOrHeight: string }>();
  const navigate = useNavigate();
  const [block, setBlock] = useState<BlockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hashOrHeight) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/block/${hashOrHeight}`)
      .then((r) => {
        if (r.status === 404) {
          // Looks like a txid — redirect transparently
          navigate(`/tx/${hashOrHeight}`, { replace: true });
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BlockData>;
      })
      .then((data) => { if (data) { setBlock(data); setLoading(false); } })
      .catch((err: unknown) => { setError(String(err)); setLoading(false); });
  }, [hashOrHeight, navigate]);

  if (loading) return <div className="detail-loading">Loading block…</div>;
  if (error) return <div className="detail-error">Error: {error}</div>;
  if (!block) return null;

  return (
    <div className="detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">Dashboard</Link> › Block #{block.height.toLocaleString()}
      </div>

      <h1 className="detail-title">
        Block <span className="highlight">{block.height.toLocaleString()}</span>
      </h1>

      <div className="detail-card">
        <DetailRow label="Height" value={block.height.toLocaleString()} />
        <DetailRow label="Hash" value={block.hash} mono />
        <DetailRow label="Previous block" value={block.prevHash} mono link={`/block/${block.prevHash}`} />
        <DetailRow label="Timestamp" value={`${new Date(block.timestamp * 1000).toUTCString()} (${timeAgo(block.timestamp)})`} />
        <DetailRow label="Transactions" value={block.nTx.toLocaleString()} />
        <DetailRow label="Size" value={formatBytes(block.size)} />
        <DetailRow label="Weight" value={formatBytes(block.weight)} />
        <DetailRow label="Difficulty" value={block.difficulty.toLocaleString()} />
        <DetailRow label="Block reward" value={<XMRAmount piconero={block.reward} decimals={6} />} />
        <DetailRow label="Nonce" value={block.nonce.toLocaleString()} />
        <DetailRow label="Version" value={`${block.majorVersion}.${block.minorVersion}`} />
        <DetailRow label="Miner TX" value={block.minerTxHash} mono link={`/tx/${block.minerTxHash}`} />
      </div>

      {(block.txHashes?.length ?? 0) > 0 && (
        <div className="detail-txlist">
          <h2>Transactions ({block.txHashes.length})</h2>
          <div className="tx-hash-list">
            {block.txHashes.map((txid) => (
              <Link key={txid} to={`/tx/${txid}`} className="tx-hash-item">
                {txid}
              </Link>
            ))}
          </div>
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
  value: React.ReactNode;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className={`detail-row-value ${mono ? 'mono' : ''}`}>
        {link && typeof value === 'string' ? <Link to={link}>{value}</Link> : value}
      </div>
    </div>
  );
}
