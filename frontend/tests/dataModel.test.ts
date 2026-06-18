import { describe, expect, test } from 'vitest';
import { AppData, CURRENT_DATA_VERSION, migrateAppData } from '../src/dataModel';

const fallback: AppData = {
  version: CURRENT_DATA_VERSION,
  assets: [],
  exchangeRates: { USD: 1 },
  targetAllocations: { Stocks: 0.25, Bonds: 0.25, Gold: 0.25, Cash: 0.25 },
  baseCurrency: 'USD',
  compactNumbers: true,
  privacyMode: false,
  darkMode: false,
  visualTheme: 'workbench',
  rebalanceBand: 5,
  history: [],
};

describe('saved data migration', () => {
  test('migrates legacy data without a version', () => {
    const migrated = migrateAppData({
      baseCurrency: 'JPY',
      visualTheme: 'wabi',
      assets: [{ id: 'cash', name: 'Cash', category: 'Cash', currency: 'JPY', amount: 1000 }],
    }, fallback);

    expect(migrated.version).toBe(CURRENT_DATA_VERSION);
    expect(migrated.baseCurrency).toBe('JPY');
    expect(migrated.visualTheme).toBe('wabi');
    expect(migrated.assets).toHaveLength(1);
    expect(migrated.targetAllocations.Stocks).toBe(0.25);
  });

  test('falls back safely for malformed stored collections', () => {
    const migrated = migrateAppData({
      assets: 'bad',
      history: null,
      visualTheme: 'unknown',
    }, fallback);

    expect(migrated.assets).toEqual([]);
    expect(migrated.history).toEqual([]);
    expect(migrated.visualTheme).toBe('workbench');
  });
});
