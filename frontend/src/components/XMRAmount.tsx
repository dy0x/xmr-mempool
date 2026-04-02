/**
 * XMRAmount — renders an XMR value with a fiat hover tooltip.
 * Usage: <XMRAmount piconero={block.reward} decimals={4} />
 *        <XMRAmount xmr={0.00032768} decimals={8} />
 */

import { usePrice } from '../contexts/PriceContext';
import { CURRENCIES } from './CurrencyBar';

interface Props {
  /** Raw piconero value (1 XMR = 1e12 piconero). */
  piconero?: number;
  /** Already-converted XMR value (alternative to piconero). */
  xmr?: number;
  /** Decimal places for the XMR display. Default: 6 */
  decimals?: number;
  /** If true, omits the "XMR" suffix (useful when shown in table headers). */
  noSuffix?: boolean;
}

export default function XMRAmount({ piconero, xmr: xmrProp, decimals = 6, noSuffix }: Props) {
  const { xmrPrice, selectedCurrency } = usePrice();

  const xmrValue = xmrProp != null ? xmrProp : (piconero ?? 0) / 1e12;
  const display  = xmrValue.toFixed(decimals);

  const currencyInfo = CURRENCIES.find(c => c.code === selectedCurrency);
  const symbol       = currencyInfo?.symbol ?? selectedCurrency.toUpperCase();

  let tipText: string | null = null;
  if (xmrPrice != null && xmrPrice > 0) {
    const fiat = xmrValue * xmrPrice;
    // Format: small amounts show more decimals
    const formatted = fiat < 0.01
      ? fiat.toFixed(6)
      : fiat < 1
      ? fiat.toFixed(4)
      : fiat < 1000
      ? fiat.toFixed(2)
      : fiat.toLocaleString(undefined, { maximumFractionDigits: 0 });
    tipText = `≈ ${symbol}${formatted} ${selectedCurrency.toUpperCase()}`;
  }

  if (!tipText) {
    return <span>{display}{noSuffix ? '' : ' XMR'}</span>;
  }

  return (
    <span className="xmr-amount">
      {display}{noSuffix ? '' : ' XMR'}
      <span className="xmr-amount-tip">{tipText}</span>
    </span>
  );
}
