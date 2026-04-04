import { Link } from 'react-router-dom';
import type { RecentBlock } from '../types';
import { formatBytes, timeAgo } from '../types';
import XMRAmount from './XMRAmount';

interface Props {
  recentBlocks: RecentBlock[];
}

export default function BlocksList({ recentBlocks }: Props) {
  if (recentBlocks.length === 0) {
    return (
      <div className="blocks-list">
        <div className="blocks-list-header">
          <h2>Recent Blocks</h2>
        </div>
        <div className="blocks-list-empty">Loading blocks…</div>
      </div>
    );
  }

  return (
    <div className="blocks-list">
      <div className="blocks-list-header">
        <h2>Recent Blocks</h2>
        <span className="blocks-list-sub">Block target: 120 seconds</span>
      </div>

      <div className="table-wrapper">
        <table className="blocks-table">
          <thead>
            <tr>
              <th>Height</th>
              <th>Age</th>
              <th>Miner</th>
              <th>Transactions</th>
              <th>Size</th>
              <th>Reward</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {recentBlocks.map((block, i) => (
              <tr
                key={block.hash}
                className={[
                  i === 0 && !block.isOrphan ? 'latest-row' : '',
                  block.isOrphan ? 'orphan-row' : '',
                ].filter(Boolean).join(' ')}
              >
                <td>
                  {block.isOrphan ? (
                    <span className="block-height-orphan" title="Orphaned block — not on the main chain">
                      {block.height.toLocaleString()} ⚠
                    </span>
                  ) : (
                    <Link to={`/block/${block.height}`} className="block-height-link">
                      {block.height.toLocaleString()}
                    </Link>
                  )}
                </td>
                <td className="age-cell">{timeAgo(block.timestamp)}</td>
                <td className="miner-cell">
                  <MinerBadge block={block} />
                </td>
                <td>{block.isOrphan ? '—' : block.nTx.toLocaleString()}</td>
                <td>{block.isOrphan ? '—' : formatBytes(block.size)}</td>
                <td className="reward-cell">
                  <XMRAmount piconero={block.reward} decimals={4} />
                </td>
                <td className="hash-cell">
                  {block.isOrphan ? (
                    <span className="hash-link orphan-hash">{block.hash.slice(0, 12)}…{block.hash.slice(-6)}</span>
                  ) : (
                    <Link to={`/block/${block.hash}`} className="hash-link">
                      {block.hash.slice(0, 12)}…{block.hash.slice(-6)}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MinerBadge({ block }: { block: RecentBlock }) {
  if (block.isOrphan) {
    return <span className="miner-badge orphan-badge">Orphaned</span>;
  }
  if (block.miner === 'p2pool') {
    return (
      <span className="miner-badge p2pool-badge" title="Mined by P2Pool — a decentralized mining pool">
        P2Pool
      </span>
    );
  }
  return <span className="miner-badge unknown-badge">—</span>;
}

export function P2PoolIcon({ size = 13 }: { size?: number }) {
  return (
    <a
      // href="https://p2pool.io/#pool" 
      href="https://p2pool.observer/"
      target="_blank"
      rel="noopener noreferrer"
      className="p2pool-icon-link"
      onClick={(e) => e.stopPropagation()}
      title="View on p2pool.io"
      style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}
    >
      <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monero P2Pool icon">
        {/* outer orbit */}
        <circle cx="128" cy="128" r="94" fill="none" stroke="#2A2A2A" strokeWidth="10" />

        {/* peer nodes */}
        <circle cx="128" cy="34" r="12" fill="#FF6600" stroke="#FFFFFF" strokeWidth="4" />
        <circle cx="208" cy="78" r="12" fill="#FFFFFF" stroke="#2A2A2A" strokeWidth="4" />
        <circle cx="208" cy="178" r="12" fill="#FF6600" stroke="#FFFFFF" strokeWidth="4" />
        <circle cx="48" cy="178" r="12" fill="#FFFFFF" stroke="#2A2A2A" strokeWidth="4" />
        <circle cx="48" cy="78" r="12" fill="#FF6600" stroke="#FFFFFF" strokeWidth="4" />

        {/* hub badge */}
        <circle cx="128" cy="128" r="62" fill="#111111" />

        {/* Monero orange cap */}
        <path d="M66 128 A62 62 0 0 1 190 128 L164 128 L164 97 L128 133 L92 97 L92 128 Z" fill="#FF6600" />

        {/* Monero white M */}
        <path d="M84 128 V170 H104 V129 L128 153 L152 129 V170 H172 V128 H156 L156 121 L128 149 L100 121 V128 Z" fill="#FFFFFF" />
      </svg>
    </a>
  );
}
