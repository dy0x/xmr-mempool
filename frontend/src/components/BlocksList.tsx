import { Link } from 'react-router-dom';
import type { RecentBlock } from '../types';
import { formatBytes, piconeroToXMR, timeAgo } from '../types';

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
              <th>Transactions</th>
              <th>Size</th>
              <th>Reward</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {recentBlocks.map((block, i) => (
              <tr key={block.height} className={i === 0 ? 'latest-row' : ''}>
                <td>
                  <Link to={`/block/${block.height}`} className="block-height-link">
                    {block.height.toLocaleString()}
                  </Link>
                </td>
                <td className="age-cell">{timeAgo(block.timestamp)}</td>
                <td>{block.nTx.toLocaleString()}</td>
                <td>{formatBytes(block.size)}</td>
                <td className="reward-cell">
                  {piconeroToXMR(block.reward, 4)} XMR
                </td>
                <td className="hash-cell">
                  <Link to={`/block/${block.hash}`} className="hash-link">
                    {block.hash.slice(0, 12)}…{block.hash.slice(-6)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
