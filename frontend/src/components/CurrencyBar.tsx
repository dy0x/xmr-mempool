/**
 * CurrencyBar — sticky footer showing live XMR price + currency selector.
 * Similar to the bottom bar on mempool.space.
 *
 * Fetches price from CoinGecko public API every 60 s.
 */

import { useEffect, useState, useCallback } from 'react';

export interface CurrencyInfo {
  code: string;   // lowercase, matches CoinGecko key
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'usd', symbol: '$',  label: 'USD' },
  { code: 'aud', symbol: 'A$', label: 'AUD' },
  { code: 'cad', symbol: 'C$', label: 'CAD' },
  { code: 'cny', symbol: '¥',  label: 'CNY' },
  { code: 'eur', symbol: '€',  label: 'EUR' },
  { code: 'gbp', symbol: '£',  label: 'GBP' },
];

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=monero&vs_currencies=usd,aud,cad,cny,eur,gbp&include_24hr_change=true';

interface PriceData {
  prices: Record<string, number>;   // currency code → price
  changes: Record<string, number>;  // currency code → 24h % change
  fetchedAt: number;
}

interface Props {
  selectedCurrency: string;
  onSelectCurrency: (code: string) => void;
}

export default function CurrencyBar({
  selectedCurrency,
  onSelectCurrency,
}: Props) {
  return (
    <footer className="currency-bar">
      <div className="currency-bar-inner">
        <div className="currency-bar-left">
          <span className="currency-source">via CoinGecko</span>
        </div>

        <div className="currency-bar-right">
          <div className="currency-selector">
            <select 
              value={selectedCurrency}
              onChange={(e) => onSelectCurrency(e.target.value)}
              className="currency-dropdown"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Price fetcher hook (used by App) ──────────────────────────────────────────

export function usePriceData() {
  const [data, setData] = useState<PriceData>({ prices: {}, changes: {}, fetchedAt: 0 });

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(COINGECKO_URL);
      if (!res.ok) return;
      const json = await res.json();
      const m = json?.monero ?? {};
      const prices: Record<string, number> = {};
      const changes: Record<string, number> = {};
      for (const c of CURRENCIES) {
        if (m[c.code] != null)                prices[c.code] = m[c.code];
        if (m[`${c.code}_24h_change`] != null) changes[c.code] = m[`${c.code}_24h_change`];
      }
      setData({ prices, changes, fetchedAt: Date.now() });
    } catch {
      // silently ignore — price display is best-effort
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const timer = setInterval(fetchPrices, 60_000);
    return () => clearInterval(timer);
  }, [fetchPrices]);

  return data;
}
