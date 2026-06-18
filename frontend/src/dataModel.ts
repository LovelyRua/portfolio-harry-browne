import { Asset, Category, ExchangeRates, HistorySnapshot } from './types';

export const CURRENT_DATA_VERSION = 2;

export type AppData = {
  version: number;
  assets: Asset[];
  exchangeRates: ExchangeRates;
  targetAllocations: Record<Category, number>;
  baseCurrency: string;
  compactNumbers: boolean;
  privacyMode: boolean;
  darkMode: boolean;
  visualTheme: 'workbench' | 'wabi';
  rebalanceBand: number;
  history: HistorySnapshot[];
};

export function migrateAppData(raw: unknown, fallback: AppData): AppData {
  if (!raw || typeof raw !== 'object') return fallback;
  const stored = raw as Partial<AppData>;

  return {
    ...fallback,
    ...stored,
    version: CURRENT_DATA_VERSION,
    assets: Array.isArray(stored.assets) ? stored.assets : fallback.assets,
    exchangeRates: stored.exchangeRates && typeof stored.exchangeRates === 'object'
      ? stored.exchangeRates
      : fallback.exchangeRates,
    targetAllocations: stored.targetAllocations && typeof stored.targetAllocations === 'object'
      ? { ...fallback.targetAllocations, ...stored.targetAllocations }
      : fallback.targetAllocations,
    history: Array.isArray(stored.history) ? stored.history : fallback.history,
    visualTheme: stored.visualTheme === 'wabi' ? 'wabi' : 'workbench',
  };
}
