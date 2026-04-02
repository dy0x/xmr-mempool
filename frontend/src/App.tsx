import { useEffect, useReducer, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Dashboard from './components/Dashboard';
import BlockDetail from './components/BlockDetail';
import TxDetail from './components/TxDetail';
import CurrencyBar, { usePriceData } from './components/CurrencyBar';
import About from './components/About';
import { wsService, WSMessage, InitPayload, StatsPayload } from './services/websocket';
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
  | { type: 'BLOCKS'; payload: AppState['recentBlocks'] };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: action.payload };
    case 'INIT':
      return {
        ...state,
        recentBlocks: action.payload.blocks,
        mempoolInfo: action.payload.mempoolInfo,
        mempoolBlocks: action.payload.mempoolBlocks,
        fees: action.payload.fees,
        networkStats: action.payload.networkStats,
        loading: false,
        lastUpdated: Date.now(),
      };
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
    case 'BLOCKS':
      return { ...state, recentBlocks: action.payload, lastUpdated: Date.now() };
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
    <BrowserRouter>
      <div className="app">
        <NavBar connected={state.connected} networkStats={state.networkStats} />
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
                />
              }
            />
            <Route path="/block/:hashOrHeight" element={<BlockDetail />} />
            <Route path="/tx/:txid" element={<TxDetail />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        <footer className="app-footer">
          Node Version: <span className="mono">{state.networkStats?.version ?? 'Unknown'}</span>
        </footer>

        <CurrencyBar
          selectedCurrency={selectedCurrency}
          onSelectCurrency={handleSelectCurrency}
        />
      </div>
    </BrowserRouter>
  );
}
