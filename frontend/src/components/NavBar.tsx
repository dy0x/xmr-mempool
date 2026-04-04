import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';


export default function NavBar() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [query, setQuery]     = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: "/" focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Route based on input:
    // 64-char hex → txid or block hash
    // All digits → block height
    // Otherwise → try block hash first
    if (/^\d+$/.test(q)) {
      navigate(`/block/${q}`);
    } else if (/^[0-9a-fA-F]{64}$/.test(q)) {
      // Could be a block hash or txid — we try block first; if it 404s,
      // BlockDetail will fall back to TxDetail gracefully.
      navigate(`/block/${q}`);
    } else {
      navigate(`/tx/${q}`);
    }
    setQuery('');
    inputRef.current?.blur();
  };

  const isActive = (path: string) =>
    location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link to="/" className="navbar-brand">
          <XmrLogo />
          <span className="brand-text">
            <span className="brand-xmr">XMR</span><span className="brand-lens">Lens</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="nav-links">
          <Link to="/" className={isActive('/')}>Dashboard</Link>
          <Link to="/about" className={isActive('/about')}>About</Link>
        </div>

        {/* Search bar */}
        <form className={`search-form ${focused ? 'search-focused' : ''}`} onSubmit={handleSearch}>
          <span className="search-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10.5" y1="10.5" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Block height, block hash, or txid…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="search-kbd">/</kbd>
        </form>

      </div>
    </nav>
  );
}

function XmrLogo() {
  return (
    <img src="/xmr-logo.png" alt="Monero" className="navbar-logo-img" />
  );
}
