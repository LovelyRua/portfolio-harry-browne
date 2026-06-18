export type Category = 'Stocks' | 'Bonds' | 'Gold' | 'Cash';

export interface Asset {
  id: string;
  amount: number;
  currency: string;
  name: string;
  category: Category;
  note?: string;
  archivedAt?: string;
}

export type ExchangeRates = Record<string, number>;

export interface HistorySnapshot {
  id: string;
  date: string;
  timestamp: number;
  totalValue: number;
  baseCurrency: string;
  categoryValues?: Record<Category, number>;
  portfolio?: {
    assets: Asset[];
    exchangeRates: ExchangeRates;
    targetAllocations: Record<Category, number>;
    baseCurrency: string;
    rebalanceBand: number;
  };
  note?: string;
}

export const DEFAULT_RATES: ExchangeRates = {
  USD: 1,
  CNY: 7.2,
  HKD: 7.8,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150,
};

export const CATEGORY_COLORS: Record<Category, string> = {
  Stocks: '#3b82f6',
  Bonds: '#10b981',
  Gold: '#f59e0b',
  Cash: '#6b7280',
};
