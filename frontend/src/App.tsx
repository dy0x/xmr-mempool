import { useEffect, useReducer, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Dashboard from './components/Dashboard';
import BlockDetail from './components/BlockDetail';
import TxDetail from './components/TxDetail';
import MempoolBlockDetail from './components/MempoolBlockDetail';
import { usePriceData, CURRENCIES } from './components/CurrencyBar';
import About from './components/About';
import { wsService, WSMessage, InitPayload, StatsPayload } from './services/websocket';
import { PriceProvider } from './contexts/PriceContext';
import type { AppState } from './types';
import './index.css';

// ── State management ──────────────────────────────────────────────────────────

const initialState: AppState = {
  mempoolBlocks: [],
  recentBlocks: [],
  mempoolInfo: null,
  fees: null,
  networkStats: null,
  connected: false,
  loading: true,
  lastUpdated: 0,
};

type Action =
  | { type: 'CONNECTED'; payload: boolean }
  | { type: 'INIT'; payload: InitPayload }
  | { type: 'MEMPOOL_BLOCKS'; payload: AppState['mempoolBlocks'] }
  | { type: 'STATS'; payload: StatsPayload }
  | { type: 'BLOCKS'; payload: AppState['recentBlocks'] }
  | { type: 'APPEND_BLOCKS'; payload: AppState['recentBlocks'] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: action.payload };
    case 'INIT': {
      const incoming = action.payload.blocks;
      const incomingMinHeight = incoming[incoming.length - 1]?.height ?? 0;
      const preserved = state.recentBlocks.filter(b => b.height < incomingMinHeight);
      return {
        ...state,
        recentBlocks: [...incoming, ...preserved],
        mempoolInfo: action.payload.mempoolInfo,
        mempoolBlocks: action.payload.mempoolBlocks,
        fees: action.payload.fees,
        networkStats: action.payload.networkStats,
        loading: false,
        lastUpdated: Date.now(),
      };
    }
    case 'MEMPOOL_BLOCKS':
      return { ...state, mempoolBlocks: action.payload, lastUpdated: Date.now() };
    case 'STATS':
      return {
        ...state,
        mempoolInfo: action.payload.mempoolInfo,
        fees: action.payload.fees,
        networkStats: action.payload.networkStats,
        lastUpdated: Date.now(),
      };
    case 'BLOCKS': {
      const incoming = action.payload;
      if (!incoming.length) return state;
      const incomingMinHeight = incoming[incoming.length - 1].height;
      const preserved = state.recentBlocks.filter(b => b.height < incomingMinHeight);
      return { ...state, recentBlocks: [...incoming, ...preserved], lastUpdated: Date.now() };
    }
    case 'APPEND_BLOCKS': {
      const loadedHeights = new Set(state.recentBlocks.map(b => b.height));
      const newBlocks = action.payload.filter(b => !loadedHeights.has(b.height));
      if (!newBlocks.length) return state;
      return { ...state, recentBlocks: [...state.recentBlocks, ...newBlocks] };
    }
    default:
      return state;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Currency selection (persisted to localStorage so it survives page refresh)
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    try { return localStorage.getItem('xmr-currency') ?? 'usd'; } catch { return 'usd'; }
  });

  const handleSelectCurrency = (code: string) => {
    setSelectedCurrency(code);
    try { localStorage.setItem('xmr-currency', code); } catch { /* ignore */ }
  };

  // Live XMR price data
  const priceData = usePriceData();
  const xmrPrice = priceData.prices[selectedCurrency] ?? undefined;
  const priceChange24h = priceData.changes[selectedCurrency] ?? null;
  const priceFetchedAt = priceData.fetchedAt;

  // Theme selection
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem('xmr-theme') ?? 'XMR'; } catch { return 'XMR'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('xmr-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const unsubMsg = wsService.onMessage((msg: WSMessage) => {
      switch (msg.type) {
        case 'init':
          dispatch({ type: 'INIT', payload: msg.payload });
          break;
        case 'mempool-blocks':
          dispatch({ type: 'MEMPOOL_BLOCKS', payload: msg.payload });
          break;
        case 'stats':
          dispatch({ type: 'STATS', payload: msg.payload });
          break;
        case 'blocks':
          dispatch({ type: 'BLOCKS', payload: msg.payload });
          break;
        default:
          break;
      }
    });

    const unsubStatus = wsService.onStatus((connected: boolean) => {
      dispatch({ type: 'CONNECTED', payload: connected });
    });

    wsService.connect();

    return () => {
      unsubMsg();
      unsubStatus();
      wsService.disconnect();
    };
  }, []);

  return (
    <PriceProvider value={{ xmrPrice, selectedCurrency }}>
    <BrowserRouter>
      <div className="app">
        <NavBar />
        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  state={state}
                  selectedCurrency={selectedCurrency}
                  xmrPrice={xmrPrice}
                  priceChange24h={priceChange24h}
                  priceFetchedAt={priceFetchedAt}
                  onAppendBlocks={(blocks) => dispatch({ type: 'APPEND_BLOCKS', payload: blocks })}
                />
              }
            />
            <Route path="/block/:hashOrHeight" element={<BlockDetail />} />
            <Route path="/tx/:txid" element={<TxDetail />} />
            <Route path="/mempool-block/:index" element={<MempoolBlockDetail />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-left">
              <div className={`ws-status ${state.connected ? 'ws-connected' : 'ws-disconnected'}`}>
                <span className="ws-dot" />
                <span className="ws-label">Mainnet</span>
              </div>
              <span className="footer-node-version">
                Node: <span className="mono">{state.networkStats?.activeNodeHost || '…'}</span>
                {state.networkStats?.version ? <>{' '}(<span className="mono">{state.networkStats.version}</span>)</> : null}
              </span>
            </div>
            <a href="https://github.com/dy0x/xmr-mempool" target="_blank" rel="noopener noreferrer" className="footer-github" title="View on GitHub">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.603-3.369-1.343-3.369-1.343-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.544 2.914 1.184.092-.923.35-1.544.636-1.899-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </a>
            <div className="theme-switcher">
              <select
                className="theme-select"
                value={selectedCurrency}
                onChange={(e) => handleSelectCurrency(e.target.value)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.symbol})
                  </option>
                ))}
              </select>
              <select
                className="theme-select"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="XMR">Monero (Default)</option>
                <option value="dusk">Dusk</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
    </PriceProvider>
  );
}
