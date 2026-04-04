import { createContext, useContext } from 'react';

interface PriceContextValue {
  xmrPrice:         number | undefined;
  selectedCurrency: string;
}

const PriceContext = createContext<PriceContextValue>({
  xmrPrice:         undefined,
  selectedCurrency: 'usd',
});

export const PriceProvider = PriceContext.Provider;
export const usePrice = () => useContext(PriceContext);
