import { Link, useLocation } from 'react-router-dom';
import type { NetworkStats } from '../types';
import { formatHashrate } from '../types';

interface Props {
  connected: boolean;
  networkStats: NetworkStats | null;
}

export default function NavBar({ connected, networkStats }: Props) {
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link to="/" className="navbar-brand">
          <XmrLogo />
          <span className="brand-text">
            <span className="brand-xmr">XMR</span>
            <span className="brand-mempool">mempool</span>
            <span className="brand-space">.space</span>
          </span>
        </Link>

        {/* Network indicator */}
        {networkStats && (
          <div className="network-pill">
            <span className="network-dot" style={{ background: connected ? '#3bd16f' : '#e84142' }} />
            <span className="network-label">Mainnet</span>
            <span className="network-sep">·</span>
            <span className="network-stat">{networkStats.height.toLocaleString()}</span>
          </div>
        )}

        {/* Nav links */}
        <div className="nav-links">
          <Link to="/" className={isActive('/')}>Dashboard</Link>
          <a
            href={`http://192.168.0.12:9976`}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            Monero Node ↗
          </a>
          {networkStats && (
            <span className="nav-stat" title="Network hashrate">
              ⛏ {formatHashrate(networkStats.hashrate)}
            </span>
          )}
        </div>

        {/* Connection status dot */}
        <div className={`ws-status ${connected ? 'ws-connected' : 'ws-disconnected'}`}>
          <span className="ws-dot" />
          <span className="ws-label">{connected ? 'Live' : 'Reconnecting…'}</span>
        </div>
      </div>
    </nav>
  );
}

function XmrLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="14" fill="#FF6600"/>
      <path d="M14 6L6 20h16L14 6Z" fill="white" opacity="0.15"/>
      <path
        d="M6.5 20.5V11.5l7.5 7.5 7.5-7.5v9"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.5 20.5V16l4.5 3.5 4.5-3.5v4.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
