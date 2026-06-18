import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  History,
  LayoutDashboard,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Palette,
  PiggyBank,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { LoginPanel } from './auth/LoginPanel';
import { useAuth } from './auth/AuthContext';
import { ApiError } from './api/client';
import { AppData, CURRENT_DATA_VERSION, migrateAppData } from './dataModel';
import { Category, CATEGORY_COLORS, DEFAULT_RATES, ExchangeRates, HistorySnapshot, Asset } from './types';
import { cn, formatCurrency, formatPercent, parseAmount } from './utils';

const AllocationCharts = lazy(() => import('./AllocationCharts').then((module) => ({ default: module.AllocationCharts })));

const CATEGORIES: Category[] = ['Stocks', 'Bonds', 'Gold', 'Cash'];

const WABI_CATEGORY_COLORS: Record<Category, string> = {
  Stocks: '#2f5d73',
  Bonds: '#687b45',
  Gold: '#b88746',
  Cash: '#777169',
};

const SAMPLE_ASSETS: Asset[] = [
  { id: 'stk-1', name: 'US Total Market ETF', category: 'Stocks', currency: 'USD', amount: 18500 },
  { id: 'stk-2', name: 'International Equity Fund', category: 'Stocks', currency: 'USD', amount: 7200 },
  { id: 'bnd-1', name: 'Long Treasury Bond ETF', category: 'Bonds', currency: 'USD', amount: 22100 },
  { id: 'gld-1', name: 'Physical Gold / Gold ETF', category: 'Gold', currency: 'USD', amount: 16400 },
  { id: 'csh-1', name: 'Treasury Bills', category: 'Cash', currency: 'USD', amount: 11800 },
  { id: 'csh-2', name: 'Emergency Cash', category: 'Cash', currency: 'JPY', amount: 620000 },
];

type AllocationRow = {
  category: Category;
  value: number;
  current: number;
  target: number;
  drift: number;
  actionAmount: number;
  withinBand: boolean;
};

type TradeRecommendation = AllocationRow & {
  side: 'Buy' | 'Sell';
  priority: 'High' | 'Medium';
};

type CloudConflict = {
  updatedAt?: string;
  payload: Partial<AppData>;
};

type SyncStatus = 'local' | 'saving' | 'syncing' | 'synced' | 'failed' | 'loading';

const DEFAULT_TARGETS: Record<Category, number> = {
  Stocks: 0.25,
  Bonds: 0.25,
  Gold: 0.25,
  Cash: 0.25,
};

const STORAGE_KEY = 'permanent_portfolio_dashboard_v2';

function createDefaultData(): AppData {
  return {
    version: CURRENT_DATA_VERSION,
    assets: SAMPLE_ASSETS,
    exchangeRates: DEFAULT_RATES,
    targetAllocations: DEFAULT_TARGETS,
    baseCurrency: 'USD',
    compactNumbers: true,
    privacyMode: false,
    darkMode: false,
    visualTheme: 'workbench',
    rebalanceBand: 5,
    history: [],
  };
}

function loadAppData(key: string, fallback: AppData): AppData {
  try {
    const saved = localStorage.getItem(key);
    return saved ? migrateAppData(JSON.parse(saved), fallback) : fallback;
  } catch {
    return fallback;
  }
}

function toBaseValue(asset: Asset, rates: ExchangeRates, baseCurrency: string) {
  const assetRate = rates[asset.currency] ?? 0;
  const baseRate = rates[baseCurrency] ?? 1;
  if (!assetRate || !baseRate) return 0;
  return (asset.amount / assetRate) * baseRate;
}

function mask(value: string, enabled: boolean) {
  return enabled ? '******' : value;
}

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

function formatSyncTimestamp(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeCloudPayload(payload: unknown): Partial<AppData> | null {
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<AppData>) : null;
  } catch {
    return null;
  }
}

function summarizePortfolio(payload: Partial<AppData>, fallback: AppData) {
  const assets = payload.assets ?? fallback.assets;
  const rates = payload.exchangeRates ?? fallback.exchangeRates;
  const baseCurrency = payload.baseCurrency ?? fallback.baseCurrency;
  const activeAssets = assets.filter((asset) => !asset.archivedAt);
  const archivedAssets = assets.filter((asset) => asset.archivedAt);
  const total = activeAssets.reduce((sum, asset) => sum + toBaseValue(asset, rates, baseCurrency), 0);
  return {
    activeCount: activeAssets.length,
    archivedCount: archivedAssets.length,
    historyCount: (payload.history ?? fallback.history).length,
    total,
    baseCurrency,
  };
}

function describePortfolioDiff(local: AppData, cloud: Partial<AppData>) {
  const remote = migrateAppData(cloud, local);
  const changes: string[] = [];

  if (local.baseCurrency !== remote.baseCurrency) changes.push(`Base currency: ${local.baseCurrency} / ${remote.baseCurrency}`);
  if (local.visualTheme !== remote.visualTheme) changes.push(`Theme: ${local.visualTheme} / ${remote.visualTheme}`);
  if (local.rebalanceBand !== remote.rebalanceBand) changes.push(`Rebalance band: ${local.rebalanceBand}% / ${remote.rebalanceBand}%`);
  if (local.assets.length !== remote.assets.length) changes.push(`Holdings: ${local.assets.length} / ${remote.assets.length}`);
  if (local.history.length !== remote.history.length) changes.push(`Snapshots: ${local.history.length} / ${remote.history.length}`);

  const changedTargets = CATEGORIES.filter(
    (category) => local.targetAllocations[category] !== remote.targetAllocations[category],
  );
  if (changedTargets.length) changes.push(`Targets differ: ${changedTargets.join(', ')}`);

  const localAssets = new Map(local.assets.map((asset) => [asset.id, asset]));
  const changedAssets = remote.assets.filter((asset) => {
    const localAsset = localAssets.get(asset.id);
    return !localAsset
      || localAsset.amount !== asset.amount
      || localAsset.currency !== asset.currency
      || localAsset.category !== asset.category
      || localAsset.archivedAt !== asset.archivedAt;
  });
  if (changedAssets.length) changes.push(`${changedAssets.length} cloud holding${changedAssets.length === 1 ? '' : 's'} added or changed`);

  return changes.length ? changes : ['Portfolio metadata changed, but headline values match.'];
}

export default function App() {
  const { token, accountEmail, api, setToken } = useAuth();
  const cloudLoadRef = useRef(false);
  const uploadTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<AppData>(() =>
    loadAppData(STORAGE_KEY, createDefaultData()),
  );
  const [activeView, setActiveView] = useState<'overview' | 'assets' | 'settings'>('overview');
  const [newAsset, setNewAsset] = useState({ name: '', amount: '', currency: 'USD', category: 'Stocks' as Category, note: '' });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [draftAsset, setDraftAsset] = useState<Asset | null>(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [snapshotNote, setSnapshotNote] = useState('');
  const [cashflowAmount, setCashflowAmount] = useState('');
  const [cashflowMode, setCashflowMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showLogin, setShowLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ratesBusy, setRatesBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (localStorage.getItem('auth_token') ? 'loading' : 'local'));
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastCloudUpdatedAt, setLastCloudUpdatedAt] = useState<string | null>(null);
  const [syncConflict, setSyncConflict] = useState<string | null>(null);
  const [cloudConflict, setCloudConflict] = useState<CloudConflict | null>(null);
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', data.darkMode);
    document.documentElement.classList.toggle('wabi-sabi', data.visualTheme === 'wabi');
    document.title = 'Permanent Portfolio Planner';
  }, [data.darkMode, data.visualTheme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (cloudLoadRef.current) return;
    if (syncConflict) {
      setSyncStatus('failed');
      return;
    }
    setSyncStatus(token ? 'saving' : 'local');
    if (!token) return;

    if (uploadTimerRef.current) window.clearTimeout(uploadTimerRef.current);
    uploadTimerRef.current = window.setTimeout(() => {
      if (!cloudLoadRef.current) {
        void syncToCloud(false);
      }
    }, 700);

    return () => {
      if (uploadTimerRef.current) window.clearTimeout(uploadTimerRef.current);
    };
  }, [api, data, syncConflict, token]);

  useEffect(() => {
    if (!token) {
      setSyncStatus('local');
      return;
    }
    setSyncStatus('loading');
    cloudLoadRef.current = true;
    let cancelled = false;

    void loadFromCloud(false, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [api, token]);

  const rates = data.exchangeRates;
  const baseCurrency = data.baseCurrency;
  const categoryColors = data.visualTheme === 'wabi' ? WABI_CATEGORY_COLORS : CATEGORY_COLORS;
  const activeAssets = useMemo(() => data.assets.filter((asset) => !asset.archivedAt), [data.assets]);
  const archivedAssets = useMemo(() => data.assets.filter((asset) => asset.archivedAt), [data.assets]);

  const enrichedAssets = useMemo(
    () =>
      activeAssets.map((asset) => ({
        ...asset,
        value: toBaseValue(asset, rates, baseCurrency),
      })),
    [activeAssets, baseCurrency, rates],
  );

  const enrichedArchivedAssets = useMemo(
    () =>
      archivedAssets.map((asset) => ({
        ...asset,
        value: toBaseValue(asset, rates, baseCurrency),
      })),
    [archivedAssets, baseCurrency, rates],
  );

  const totalValue = useMemo(() => enrichedAssets.reduce((sum, asset) => sum + asset.value, 0), [enrichedAssets]);

  const allocationRows = useMemo<AllocationRow[]>(() => {
    return CATEGORIES.map((category) => {
      const value = enrichedAssets.filter((asset) => asset.category === category).reduce((sum, asset) => sum + asset.value, 0);
      const current = totalValue > 0 ? value / totalValue : 0;
      const target = data.targetAllocations[category] ?? 0;
      const actionAmount = totalValue * target - value;
      const drift = current - target;
      return {
        category,
        value,
        current,
        target,
        drift,
        actionAmount,
        withinBand: Math.abs(drift * 100) <= data.rebalanceBand,
      };
    });
  }, [data.rebalanceBand, data.targetAllocations, enrichedAssets, totalValue]);

  const targetTotal = CATEGORIES.reduce((sum, category) => sum + (data.targetAllocations[category] ?? 0), 0);
  const missingCurrencies = Array.from(new Set(activeAssets.map((asset) => asset.currency))).filter((currency) => !rates[currency]);
  const needsRebalance = allocationRows.some((row) => !row.withinBand);
  const largestHolding = enrichedAssets.reduce<(typeof enrichedAssets)[number] | null>((best, asset) => (!best || asset.value > best.value ? asset : best), null);
  const tradeRecommendations = useMemo<TradeRecommendation[]>(
    () =>
      allocationRows
        .filter((row) => !row.withinBand && Math.abs(row.actionAmount) > 1)
        .map((row) => ({
          ...row,
          side: (row.actionAmount > 0 ? 'Buy' : 'Sell') as TradeRecommendation['side'],
          priority: (Math.abs(row.drift * 100) >= data.rebalanceBand * 1.5 ? 'High' : 'Medium') as TradeRecommendation['priority'],
        }))
        .sort((a, b) => Math.abs(b.actionAmount) - Math.abs(a.actionAmount)),
    [allocationRows, data.rebalanceBand],
  );

  const cashflowPlan = useMemo(() => {
    const amount = parseAmount(cashflowAmount);
    if (!amount || amount <= 0) return [];
    const nextTotal = cashflowMode === 'deposit' ? totalValue + amount : Math.max(totalValue - amount, 0);
    return allocationRows
      .map((row) => {
        const desired = nextTotal * row.target;
        const delta = desired - row.value;
        return { ...row, cashflowDelta: delta };
      })
      .filter((row) => (cashflowMode === 'deposit' ? row.cashflowDelta > 1 : row.cashflowDelta < -1))
      .sort((a, b) => Math.abs(b.cashflowDelta) - Math.abs(a.cashflowDelta));
  }, [allocationRows, cashflowAmount, cashflowMode, totalValue]);
  const localConflictSummary = useMemo(() => summarizePortfolio(data, data), [data]);
  const cloudConflictSummary = useMemo(
    () => (cloudConflict ? summarizePortfolio(cloudConflict.payload, data) : null),
    [cloudConflict, data],
  );
  const cloudConflictDiff = useMemo(
    () => (cloudConflict ? describePortfolioDiff(data, cloudConflict.payload) : []),
    [cloudConflict, data],
  );

  function updateData(patch: Partial<AppData>) {
    setData((current) => ({ ...current, ...patch }));
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2800);
  }

  async function syncToCloud(manual: boolean) {
    if (!token) {
      setShowLogin(true);
      showNotice('Sign in to use cloud backup.');
      return;
    }

    setSyncBusy(true);
    setSyncStatus('syncing');
    try {
      const serverState = await api.data.get();
      if (serverState.updatedAt && lastCloudUpdatedAt && serverState.updatedAt !== lastCloudUpdatedAt) {
        const message = `Cloud backup changed at ${formatSyncTimestamp(serverState.updatedAt)}.`;
        const cloudPayload = normalizeCloudPayload(serverState.payload);
        setCloudConflict(cloudPayload ? { updatedAt: serverState.updatedAt, payload: cloudPayload } : null);
        if (!manual) {
          setSyncStatus('failed');
          setSyncConflict(`${message} Review before overwriting.`);
          showNotice('Cloud changed elsewhere. Use Load cloud or Sync now.');
          return;
        }
        if (!window.confirm(`${message} Overwrite it with this local portfolio?`)) {
          setSyncStatus('failed');
          setSyncConflict('Manual sync paused because the cloud backup changed elsewhere.');
          return;
        }
      }
      const response = await api.data.upload(data);
      setSyncStatus('synced');
      setSyncConflict(null);
      setCloudConflict(null);
      setLastCloudUpdatedAt(response.updatedAt ?? null);
      setLastSyncedAt(formatSyncTimestamp(response.updatedAt));
      if (manual) showNotice('Cloud backup updated.');
    } catch (error) {
      handleSyncError(error, 'Cloud sync failed. Local data is still saved.');
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadFromCloud(manual: boolean, isCancelled: () => boolean = () => false) {
    if (!token) {
      setShowLogin(true);
      showNotice('Sign in to load a cloud backup.');
      return;
    }
    if (manual && !window.confirm('Load the cloud backup? Current local data will be saved as a safety snapshot first.')) return;

    setSyncBusy(true);
    setSyncStatus('loading');
    cloudLoadRef.current = true;
    try {
      const response = await api.data.get();
      if (isCancelled()) return;
      if (!response.payload) {
        setSyncStatus('synced');
        setSyncConflict(null);
        setCloudConflict(null);
        setLastCloudUpdatedAt(response.updatedAt ?? null);
        if (manual) showNotice('No cloud backup found yet.');
        return;
      }

      const payload = typeof response.payload === 'string' ? JSON.parse(response.payload) : response.payload;
      if (payload && typeof payload === 'object') {
        setData((current) => {
          const cloudPayload = migrateAppData(payload, current);
          const cloudHistory = cloudPayload.history ?? current.history;
          const nextHistory = manual ? [...cloudHistory, buildSnapshot('Before loading cloud backup')] : cloudHistory;
          return { ...current, ...cloudPayload, history: nextHistory };
        });
        setSyncStatus('synced');
        setSyncConflict(null);
        setCloudConflict(null);
        setLastCloudUpdatedAt(response.updatedAt ?? null);
        setLastSyncedAt(formatSyncTimestamp(response.updatedAt));
        showNotice(manual ? 'Cloud backup loaded. Local state was kept in history.' : 'Cloud portfolio loaded.');
      }
    } catch (error) {
      handleSyncError(error, 'Could not load cloud data. Continuing locally.');
    } finally {
      setSyncBusy(false);
      window.setTimeout(() => {
        cloudLoadRef.current = false;
      }, 500);
    }
  }

  function handleSyncError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      setToken(null);
      setSyncStatus('local');
      setSyncConflict(null);
      setCloudConflict(null);
      showNotice('Session expired. Local data is still saved.');
      return;
    }
    setSyncStatus('failed');
    showNotice(fallback);
  }

  async function overwriteCloudConflict() {
    if (!token) return;
    if (!window.confirm('Overwrite the newer cloud backup with this local portfolio?')) return;

    setSyncBusy(true);
    setSyncStatus('syncing');
    try {
      const response = await api.data.upload(data);
      setSyncConflict(null);
      setCloudConflict(null);
      setSyncStatus('synced');
      setLastCloudUpdatedAt(response.updatedAt ?? null);
      setLastSyncedAt(formatSyncTimestamp(response.updatedAt));
      showNotice('Local portfolio saved over the cloud backup.');
    } catch (error) {
      handleSyncError(error, 'Could not overwrite the cloud backup.');
    } finally {
      setSyncBusy(false);
    }
  }

  function loadCloudConflict() {
    if (!cloudConflict) return;
    if (!window.confirm('Load the cloud portfolio? Current local data will be saved as a safety snapshot first.')) return;

    setData((current) => {
      const cloudPayload = migrateAppData(cloudConflict.payload, current);
      const cloudHistory = cloudPayload.history ?? current.history;
      return {
        ...current,
        ...cloudPayload,
        history: [...cloudHistory, buildSnapshot('Before loading conflicting cloud backup')],
      };
    });
    setLastCloudUpdatedAt(cloudConflict.updatedAt ?? null);
    setLastSyncedAt(formatSyncTimestamp(cloudConflict.updatedAt));
    setSyncConflict(null);
    setCloudConflict(null);
    setSyncStatus('synced');
    setActiveView('overview');
    showNotice('Cloud portfolio loaded. Local state was kept in history.');
  }

  function dismissCloudConflict() {
    setSyncConflict(null);
    setCloudConflict(null);
    setSyncStatus(token ? 'saving' : 'local');
    showNotice('Conflict dismissed. Auto sync will retry on the next local change.');
  }

  function addAsset(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseAmount(newAsset.amount);
    if (!newAsset.name.trim() || amount <= 0) {
      showNotice('Add a name and a positive amount.');
      return;
    }

    const asset: Asset = {
      id: crypto.randomUUID(),
      name: newAsset.name.trim(),
      amount,
      currency: newAsset.currency.trim().toUpperCase(),
      category: newAsset.category,
      note: newAsset.note.trim() || undefined,
    };

    updateData({ assets: [asset, ...data.assets] });
    setNewAsset({ name: '', amount: '', currency: asset.currency, category: newAsset.category, note: '' });
    showNotice('Asset added.');
  }

  function startEdit(asset: Asset) {
    setEditingAssetId(asset.id);
    setDraftAsset(asset);
    setDraftAmount(String(asset.amount));
  }

  function saveEdit() {
    if (!draftAsset) return;
    const amount = parseAmount(draftAmount);
    if (!draftAsset.name.trim() || amount <= 0) {
      showNotice('Use a name and a positive amount.');
      return;
    }

    updateData({
      assets: data.assets.map((asset) =>
        asset.id === draftAsset.id
          ? {
              ...draftAsset,
              name: draftAsset.name.trim(),
              currency: draftAsset.currency.trim().toUpperCase(),
              amount,
            }
          : asset,
      ),
    });
    setEditingAssetId(null);
    setDraftAsset(null);
    setDraftAmount('');
    showNotice('Asset updated.');
  }

  function deleteAsset(id: string) {
    const asset = data.assets.find((item) => item.id === id);
    if (asset && !window.confirm(`Delete "${asset.name}" from this portfolio?`)) return;
    updateData({ assets: data.assets.filter((asset) => asset.id !== id) });
  }

  function archiveAsset(asset: Asset) {
    if (!window.confirm(`Archive "${asset.name}"? It will stop affecting current allocation.`)) return;
    updateData({
      assets: data.assets.map((item) =>
        item.id === asset.id ? { ...item, archivedAt: new Date().toISOString() } : item,
      ),
    });
    showNotice('Asset archived.');
  }

  function restoreAsset(asset: Asset) {
    updateData({
      assets: data.assets.map((item) => {
        if (item.id !== asset.id) return item;
        const restored = { ...item };
        delete restored.archivedAt;
        return restored;
      }),
    });
    showNotice('Asset restored.');
  }

  function duplicateAsset(asset: Asset) {
    const copy: Asset = {
      ...asset,
      id: crypto.randomUUID(),
      name: `${asset.name} copy`,
      note: asset.note ? `${asset.note} (duplicated)` : 'Duplicated asset',
    };
    updateData({ assets: [copy, ...data.assets] });
    showNotice('Asset duplicated.');
  }

  function buildSnapshot(note?: string): HistorySnapshot {
    const categoryValues = Object.fromEntries(allocationRows.map((row) => [row.category, row.value])) as Record<Category, number>;
    return {
      id: crypto.randomUUID(),
      date: todayLabel(),
      timestamp: Date.now(),
      totalValue,
      baseCurrency,
      categoryValues,
      portfolio: {
        assets: data.assets,
        exchangeRates: data.exchangeRates,
        targetAllocations: data.targetAllocations,
        baseCurrency: data.baseCurrency,
        rebalanceBand: data.rebalanceBand,
      },
      note: note?.trim() || undefined,
    };
  }

  function saveSnapshot() {
    if (!activeAssets.length) {
      showNotice('Add an active holding before saving a snapshot.');
      return;
    }
    const snapshot = buildSnapshot(snapshotNote);
    updateData({ history: [...data.history, snapshot] });
    setSnapshotNote('');
    showNotice('Snapshot saved.');
  }

  function restoreSnapshot(snapshot: HistorySnapshot) {
    if (!snapshot.portfolio) {
      showNotice('This older snapshot has no restore data.');
      return;
    }
    if (!window.confirm(`Restore the portfolio from ${snapshot.date}? Current data will be saved as a safety snapshot first.`)) return;

    const safetySnapshot = buildSnapshot(`Before restoring ${snapshot.date}`);
    updateData({
      ...snapshot.portfolio,
      history: [...data.history, safetySnapshot],
    });
    setActiveView('overview');
    showNotice('Snapshot restored. Current data was kept in history.');
  }

  function deleteSnapshot(snapshot: HistorySnapshot) {
    if (!window.confirm(`Delete the snapshot from ${snapshot.date}?`)) return;
    updateData({ history: data.history.filter((item) => item.id !== snapshot.id) });
    showNotice('Snapshot deleted.');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `permanent-portfolio-${todayLabel()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice('Backup exported.');
  }

  function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = migrateAppData(JSON.parse(String(reader.result)), data);
        if (!Array.isArray(imported.assets) && imported.assets !== undefined) {
          throw new Error('Invalid assets');
        }
        if (imported.targetAllocations && !CATEGORIES.every((category) => typeof imported.targetAllocations?.[category] === 'number')) {
          throw new Error('Invalid targets');
        }
        const importedAssets = imported.assets?.map((asset) => ({
          ...asset,
          id: String(asset.id || crypto.randomUUID()),
          name: String(asset.name || 'Imported asset'),
          category: CATEGORIES.includes(asset.category) ? asset.category : 'Stocks',
          currency: String(asset.currency || data.baseCurrency).toUpperCase(),
          amount: Number.isFinite(Number(asset.amount)) ? Number(asset.amount) : 0,
        })).filter((asset) => asset.amount > 0);

        updateData({
          version: CURRENT_DATA_VERSION,
          assets: importedAssets ?? data.assets,
          exchangeRates: imported.exchangeRates ?? data.exchangeRates,
          targetAllocations: imported.targetAllocations ?? data.targetAllocations,
          baseCurrency: imported.baseCurrency ?? data.baseCurrency,
          compactNumbers: imported.compactNumbers ?? data.compactNumbers,
          privacyMode: imported.privacyMode ?? data.privacyMode,
          darkMode: imported.darkMode ?? data.darkMode,
          visualTheme: imported.visualTheme ?? data.visualTheme,
          rebalanceBand: imported.rebalanceBand ?? data.rebalanceBand,
          history: imported.history ?? data.history,
        });
        showNotice('Backup imported.');
      } catch {
        showNotice('That backup file could not be read.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  function resetSampleData() {
    if (!window.confirm('Replace the current local portfolio with the sample portfolio?')) return;
    setData((current) => ({
      ...createDefaultData(),
      compactNumbers: current.compactNumbers,
      privacyMode: current.privacyMode,
      darkMode: current.darkMode,
      visualTheme: current.visualTheme,
    }));
    setActiveView('overview');
    showNotice('Sample portfolio restored.');
  }

  async function refreshRates() {
    setRatesBusy(true);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const payload = await response.json();
      if (!payload?.rates) throw new Error('No rates');
      const nextRates = { ...data.exchangeRates };
      Object.keys(nextRates).forEach((currency) => {
        if (payload.rates[currency]) nextRates[currency] = payload.rates[currency];
      });
      updateData({ exchangeRates: nextRates });
      showNotice('Rates refreshed.');
    } catch {
      showNotice('Rate refresh failed. Manual rates are still available.');
    } finally {
      setRatesBusy(false);
    }
  }

  const viewButtons = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'assets', label: 'Assets', icon: PiggyBank },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  const syncCopy = getSyncCopy(syncStatus, lastSyncedAt);

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="app-shell">
          <div>
            <p className="eyebrow">Harry Browne strategy workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Permanent Portfolio Planner</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              A quiet command center for balancing stocks, bonds, gold and cash across currencies.
            </p>
          </div>
          <div className="hero-command">
            <div className="hero-total">
              <span>Portfolio value</span>
              <strong>{mask(formatCurrency(totalValue, baseCurrency, data.compactNumbers), data.privacyMode)}</strong>
              <em>{needsRebalance ? 'Rebalance review open' : 'Within current band'}</em>
            </div>
            <div className="hero-actions">
              <button className="btn-primary" onClick={() => setActiveView('assets')} type="button">
                <Plus className="h-4 w-4" /> Add asset
              </button>
              <button className="btn-secondary" onClick={() => setActiveView('overview')} type="button">
                <BarChart3 className="h-4 w-4" /> Review
              </button>
              <button className="btn-secondary" onClick={saveSnapshot} type="button">
                <Save className="h-4 w-4" /> Snapshot
              </button>
            </div>
            <div className={cn('sync-badge', `is-${syncStatus}`)} role="status" aria-live="polite">
              <span>{syncCopy.label}</span>
              <strong>{syncCopy.detail}</strong>
            </div>
            <div className="utility-actions">
              <IconButton label={data.privacyMode ? 'Show values' : 'Hide values'} onClick={() => updateData({ privacyMode: !data.privacyMode })}>
                {data.privacyMode ? <EyeOff /> : <Eye />}
              </IconButton>
              <IconButton label={data.darkMode ? 'Light mode' : 'Dark mode'} onClick={() => updateData({ darkMode: !data.darkMode })}>
                {data.darkMode ? <Sun /> : <Moon />}
              </IconButton>
              <button
                className="btn-secondary"
                onClick={() => updateData({ visualTheme: data.visualTheme === 'wabi' ? 'workbench' : 'wabi' })}
                type="button"
              >
                <Palette className="h-4 w-4" />
                {data.visualTheme === 'wabi' ? 'Workbench' : 'Wabi-sabi'}
              </button>
              {token ? (
                <div className="account-chip">
                  <span>{accountEmail ?? 'Cloud account'}</span>
                  <button className="btn-secondary" onClick={() => setToken(null)} type="button">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              ) : (
                <button className="btn-secondary" onClick={() => setShowLogin(true)} type="button">
                  <LogIn className="h-4 w-4" /> Sync
                </button>
              )}
            </div>
          </div>
        </header>

        <nav className="tabbar" aria-label="Primary views">
          {viewButtons.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cn('tab-button', activeView === item.id && 'is-active')}
                onClick={() => setActiveView(item.id)}
                type="button"
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {notice && <div className="notice" role="status" aria-live="polite"><Check className="h-4 w-4" />{notice}</div>}

        {missingCurrencies.length > 0 && (
          <div className="alert" role="alert">
            <AlertTriangle className="h-5 w-5" />
            Missing exchange rates for {missingCurrencies.join(', ')}. Add them in Settings to include those assets in totals.
          </div>
        )}

        {activeView === 'overview' && (
          <>
            <section className="metric-grid overview-metrics grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total value"
                value={mask(formatCurrency(totalValue, baseCurrency, data.compactNumbers), data.privacyMode)}
                detail={`${activeAssets.length} active holdings in ${new Set(activeAssets.map((a) => a.currency)).size} currencies`}
              />
              <MetricCard
                label="Rebalance state"
                value={activeAssets.length ? (needsRebalance ? 'Action needed' : 'Inside band') : 'No holdings'}
                detail={activeAssets.length ? `${data.rebalanceBand}% tolerance band` : 'Add an asset to calculate drift'}
                tone={activeAssets.length ? (needsRebalance ? 'warn' : 'good') : undefined}
              />
              <MetricCard
                label="Largest holding"
                value={largestHolding?.name ?? 'No assets'}
                detail={largestHolding ? mask(formatCurrency(largestHolding.value, baseCurrency, data.compactNumbers), data.privacyMode) : 'Add your first position'}
              />
              <MetricCard
                label="Target model"
                value={`${Math.round(targetTotal * 100)}% allocated`}
                detail={Math.abs(targetTotal - 1) < 0.001 ? 'Ready for guidance' : 'Targets must equal 100%'}
                tone={Math.abs(targetTotal - 1) < 0.001 ? 'good' : 'warn'}
              />
            </section>

            <section className="overview-primary grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
              <Panel title="Allocation" icon={<BarChart3 />}>
                {activeAssets.length ? (
                  <Suspense fallback={<div className="chart-loading" role="status">Loading allocation charts</div>}>
                    <AllocationCharts rows={allocationRows} colors={categoryColors} baseCurrency={baseCurrency} compactNumbers={data.compactNumbers} />
                  </Suspense>
                ) : (
                  <EmptyState text="Add your first holding to see allocation and target comparisons." />
                )}
              </Panel>

              <Panel title="Rebalance" icon={<ShieldCheck />}>
                {activeAssets.length ? (
                  <>
                <div className="allocation-ledger space-y-3">
                  {allocationRows.map((row) => (
                    <AllocationLine key={row.category} row={row} baseCurrency={baseCurrency} compact={data.compactNumbers} privateMode={data.privacyMode} colors={categoryColors} />
                  ))}
                </div>
                <div className="trade-list">
                  <div className="subsection-heading">
                    <strong>Trade list</strong>
                    <span>{tradeRecommendations.length ? `${tradeRecommendations.length} actions` : 'No trades needed'}</span>
                  </div>
                  {tradeRecommendations.length ? (
                    tradeRecommendations.map((trade) => (
                      <div className="trade-row" key={trade.category}>
                        <span className={cn('trade-side', trade.side === 'Buy' ? 'is-buy' : 'is-sell')}>{trade.side}</span>
                        <div>
                          <strong>{trade.category}</strong>
                          <span>{formatPercent(Math.abs(trade.drift))} away from target · {trade.priority} priority</span>
                        </div>
                        <strong>{mask(formatCurrency(Math.abs(trade.actionAmount), baseCurrency, data.compactNumbers), data.privacyMode)}</strong>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="All sleeves are inside the rebalance band." />
                  )}
                </div>
                  </>
                ) : (
                  <EmptyState text="Rebalance guidance appears after you add an active holding." />
                )}
              </Panel>
            </section>

            <section className="overview-secondary grid gap-6 lg:grid-cols-2">
              <Panel title="Cashflow planner" icon={<ArrowDownToLine />}>
                <div className="toolbar mb-4">
                  <button className={cn('segmented', cashflowMode === 'deposit' && 'is-active')} onClick={() => setCashflowMode('deposit')} type="button" aria-pressed={cashflowMode === 'deposit'}>
                    <ArrowDownToLine className="h-4 w-4" /> Deposit
                  </button>
                  <button className={cn('segmented', cashflowMode === 'withdraw' && 'is-active')} onClick={() => setCashflowMode('withdraw')} type="button" aria-pressed={cashflowMode === 'withdraw'}>
                    <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                  </button>
                  <input className="input min-w-[150px] flex-1" value={cashflowAmount} onChange={(e) => setCashflowAmount(e.target.value)} placeholder={`Amount in ${baseCurrency}`} />
                </div>
                <div className="space-y-2">
                  {cashflowPlan.length ? (
                    cashflowPlan.map((row) => (
                      <div className="action-row" key={row.category}>
                        <div className="cashflow-copy">
                          <strong>{cashflowMode === 'deposit' ? 'Add to' : 'Take from'} {row.category}</strong>
                          <span>{cashflowReason(row, cashflowMode)}</span>
                        </div>
                        <strong>{mask(formatCurrency(Math.abs(row.cashflowDelta), baseCurrency, data.compactNumbers), data.privacyMode)}</strong>
                      </div>
                    ))
                  ) : (
                    <EmptyState text={activeAssets.length ? 'Enter a deposit or withdrawal to see the cleanest allocation path.' : 'Add an active holding before planning cash movement.'} />
                  )}
                </div>
              </Panel>

              <Panel title="History" icon={<History />}>
                <div className="toolbar mb-4">
                  <input className="input min-w-[180px] flex-1" value={snapshotNote} onChange={(e) => setSnapshotNote(e.target.value)} placeholder="Snapshot note" />
                  <button className="btn-primary" onClick={saveSnapshot} type="button"><Save className="h-4 w-4" /> Save</button>
                </div>
                <div className="space-y-2">
                  {data.history.length ? (
                    [...data.history].reverse().slice(0, 6).map((snapshot) => (
                      <div className="history-row" key={snapshot.id}>
                        <div className="history-main">
                          <strong>{snapshot.date}</strong>
                          <span>{snapshot.note || 'Portfolio snapshot'}</span>
                        </div>
                        <div className="history-metrics">
                          <strong>{mask(formatCurrency(snapshot.totalValue, snapshot.baseCurrency, data.compactNumbers), data.privacyMode)}</strong>
                          <span>{formatSnapshotDelta(totalValue, snapshot.totalValue, snapshot.baseCurrency, data.compactNumbers, data.privacyMode)}</span>
                        </div>
                        <div className="row-actions">
                          <IconButton label="Restore snapshot" onClick={() => restoreSnapshot(snapshot)}><RotateCcw /></IconButton>
                          <IconButton label="Delete snapshot" onClick={() => deleteSnapshot(snapshot)}><Trash2 /></IconButton>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="No snapshots yet. Save one after each review or major cash movement." />
                  )}
                </div>
              </Panel>
            </section>
          </>
        )}

        {activeView === 'assets' && (
          <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <Panel title="Add asset" icon={<Plus />}>
              <form className="space-y-4" onSubmit={addAsset}>
                <Field label="Name"><input className="input" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} placeholder="ETF, fund, bond, cash account" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount"><input className="input" value={newAsset.amount} onChange={(e) => setNewAsset({ ...newAsset, amount: e.target.value })} placeholder="10000" /></Field>
                  <Field label="Currency"><input className="input uppercase" value={newAsset.currency} onChange={(e) => setNewAsset({ ...newAsset, currency: e.target.value.toUpperCase() })} /></Field>
                </div>
                <Field label="Category">
                  <select className="input" value={newAsset.category} onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as Category })}>
                    {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Note"><input className="input" value={newAsset.note} onChange={(e) => setNewAsset({ ...newAsset, note: e.target.value })} placeholder="Optional" /></Field>
                <button className="btn-primary w-full" type="submit"><Plus className="h-4 w-4" /> Add asset</button>
              </form>
            </Panel>

            <Panel title="Holdings" icon={<PiggyBank />}>
              <div className="toolbar mb-4">
                <span className="muted-copy">{activeAssets.length} active / {archivedAssets.length} archived</span>
                <button className="btn-secondary" onClick={() => setShowArchivedAssets(!showArchivedAssets)} type="button" aria-expanded={showArchivedAssets}>
                  <Archive className="h-4 w-4" /> {showArchivedAssets ? 'Hide archived' : 'Show archived'}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Category</th>
                      <th>Native amount</th>
                      <th>Value</th>
                      <th>Weight</th>
                      <th className="w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedAssets.length ? enrichedAssets.map((asset) => (
                      <tr key={asset.id}>
                        {editingAssetId === asset.id && draftAsset ? (
                          <>
                            <td><input className="input table-input" value={draftAsset.name} onChange={(e) => setDraftAsset({ ...draftAsset, name: e.target.value })} /></td>
                            <td>
                              <select className="input table-input" value={draftAsset.category} onChange={(e) => setDraftAsset({ ...draftAsset, category: e.target.value as Category })}>
                                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                              </select>
                            </td>
                            <td className="native-edit">
                              <input className="input table-input" value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} />
                              <input className="input table-input currency-field" value={draftAsset.currency} onChange={(e) => setDraftAsset({ ...draftAsset, currency: e.target.value.toUpperCase() })} />
                            </td>
                            <td>{mask(formatCurrency(asset.value, baseCurrency, data.compactNumbers), data.privacyMode)}</td>
                            <td>{formatPercent(totalValue ? asset.value / totalValue : 0)}</td>
                            <td>
                              <div className="row-actions">
                                <IconButton label="Save asset" onClick={saveEdit}><Check /></IconButton>
                                <IconButton label="Cancel edit" onClick={() => setEditingAssetId(null)}><X /></IconButton>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <div className="asset-name">
                                <strong>{asset.name}</strong>
                                {asset.note && <span>{asset.note}</span>}
                              </div>
                            </td>
                            <td><CategoryPill category={asset.category} colors={categoryColors} /></td>
                            <td>{mask(`${asset.amount.toLocaleString()} ${asset.currency}`, data.privacyMode)}</td>
                            <td>{mask(formatCurrency(asset.value, baseCurrency, data.compactNumbers), data.privacyMode)}</td>
                            <td>{formatPercent(totalValue ? asset.value / totalValue : 0)}</td>
                            <td>
                              <div className="row-actions">
                                <IconButton label="Edit asset" onClick={() => startEdit(asset)}><Settings /></IconButton>
                                <IconButton label="Duplicate asset" onClick={() => duplicateAsset(asset)}><Copy /></IconButton>
                                <IconButton label="Archive asset" onClick={() => archiveAsset(asset)}><Archive /></IconButton>
                                <IconButton label="Delete asset" onClick={() => deleteAsset(asset.id)}><Trash2 /></IconButton>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6}><EmptyState text="No active holdings. Add an asset or restore one from the archive." /></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {showArchivedAssets && (
                <div className="archive-list">
                  <div className="subsection-heading">
                    <strong>Archived assets</strong>
                    <span>{archivedAssets.length} hidden from allocation</span>
                  </div>
                  {enrichedArchivedAssets.length ? (
                    enrichedArchivedAssets.map((asset) => (
                      <div className="archive-row" key={asset.id}>
                        <div className="asset-name">
                          <strong>{asset.name}</strong>
                          <span>
                            {asset.category} · {mask(`${asset.amount.toLocaleString()} ${asset.currency}`, data.privacyMode)}
                            {asset.archivedAt ? ` · archived ${asset.archivedAt.slice(0, 10)}` : ''}
                          </span>
                        </div>
                        <div className="history-metrics">
                          <strong>{mask(formatCurrency(asset.value, baseCurrency, data.compactNumbers), data.privacyMode)}</strong>
                          <span>Excluded from current allocation</span>
                        </div>
                        <div className="row-actions">
                          <IconButton label="Restore asset" onClick={() => restoreAsset(asset)}><Undo2 /></IconButton>
                          <IconButton label="Delete asset" onClick={() => deleteAsset(asset.id)}><Trash2 /></IconButton>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="No archived assets yet." />
                  )}
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Panel title="Targets" icon={<ShieldCheck />}>
              <div className="space-y-4">
                {CATEGORIES.map((category) => (
                  <label className="target-row" key={category}>
                    <span><CategoryPill category={category} colors={categoryColors} /></span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((data.targetAllocations[category] ?? 0) * 100)}
                      onChange={(e) => updateData({ targetAllocations: { ...data.targetAllocations, [category]: Number(e.target.value) / 100 } })}
                    />
                    <input
                      className="input percent-input"
                      value={Math.round((data.targetAllocations[category] ?? 0) * 100)}
                      onChange={(e) => updateData({ targetAllocations: { ...data.targetAllocations, [category]: Number(e.target.value || 0) / 100 } })}
                    />
                  </label>
                ))}
                <div className={cn('target-total', Math.abs(targetTotal - 1) < 0.001 ? 'is-good' : 'is-warn')}>
                  Current target total: {Math.round(targetTotal * 100)}%
                </div>
                <Field label="Rebalance band">
                  <input className="input" type="number" min="0" max="50" value={data.rebalanceBand} onChange={(e) => updateData({ rebalanceBand: Number(e.target.value) })} />
                </Field>
              </div>
            </Panel>

            <Panel title="Currencies and data" icon={<Settings />}>
              <div className={cn('sync-panel', syncConflict && 'has-conflict')}>
                <div>
                  <strong>{token ? accountEmail ?? 'Cloud account' : 'Local only'}</strong>
                  <span>{syncConflict ?? syncCopy.footer}</span>
                </div>
                <span>{lastCloudUpdatedAt ? `Server updated ${formatSyncTimestamp(lastCloudUpdatedAt)}` : token ? 'No server timestamp yet' : 'Not signed in'}</span>
              </div>

              {cloudConflict && cloudConflictSummary && (
                <div className="conflict-panel">
                  <div className="subsection-heading">
                    <strong>Resolve cloud conflict</strong>
                    <span>{cloudConflict.updatedAt ? `Cloud changed ${formatSyncTimestamp(cloudConflict.updatedAt)}` : 'Cloud version differs'}</span>
                  </div>
                  <div className="conflict-grid">
                    <ConflictSummaryCard title="Keep local" summary={localConflictSummary} compact={data.compactNumbers} />
                    <ConflictSummaryCard title="Load cloud" summary={cloudConflictSummary} compact={data.compactNumbers} />
                  </div>
                  <ul className="conflict-diff" aria-label="Cloud conflict differences">
                    {cloudConflictDiff.map((difference) => <li key={difference}>{difference}</li>)}
                  </ul>
                  <div className="toolbar">
                    <button className="btn-primary" onClick={() => void overwriteCloudConflict()} disabled={syncBusy} type="button">
                      <Upload className="h-4 w-4" /> Keep local
                    </button>
                    <button className="btn-secondary" onClick={loadCloudConflict} disabled={syncBusy} type="button">
                      <Download className="h-4 w-4" /> Load cloud
                    </button>
                    <button className="btn-secondary" onClick={dismissCloudConflict} disabled={syncBusy} type="button">
                      <X className="h-4 w-4" /> Decide later
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Base currency">
                  <select className="input" value={baseCurrency} onChange={(e) => updateData({ baseCurrency: e.target.value })}>
                    {Object.keys(rates).sort().map((currency) => <option key={currency}>{currency}</option>)}
                  </select>
                </Field>
                <Field label="Compact numbers">
                  <button className="toggle" onClick={() => updateData({ compactNumbers: !data.compactNumbers })} type="button" aria-pressed={data.compactNumbers}>
                    {data.compactNumbers ? 'Enabled' : 'Disabled'}
                  </button>
                </Field>
              </div>

              <div className="mt-5 space-y-2">
                {Object.entries(rates).sort(([a], [b]) => a.localeCompare(b)).map(([currency, rate]) => (
                  <label className="rate-row" key={currency}>
                    <span>{currency}</span>
                    <input className="input" type="number" step="0.0001" value={rate} onChange={(e) => updateData({ exchangeRates: { ...rates, [currency]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={refreshRates} disabled={ratesBusy} type="button">
                  <RefreshCw className={cn('h-4 w-4', ratesBusy && 'animate-spin')} /> Refresh rates
                </button>
                <button className="btn-secondary" onClick={exportData} type="button"><Download className="h-4 w-4" /> Export</button>
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} type="button"><Upload className="h-4 w-4" /> Import</button>
                <button className="btn-secondary" onClick={() => void syncToCloud(true)} disabled={syncBusy} type="button">
                  <RefreshCw className={cn('h-4 w-4', syncStatus === 'syncing' && 'animate-spin')} /> Sync now
                </button>
                <button className="btn-secondary" onClick={() => void loadFromCloud(true)} disabled={syncBusy} type="button">
                  <Download className="h-4 w-4" /> Load cloud
                </button>
                <button className="btn-secondary danger-soft" onClick={resetSampleData} type="button"><RotateCcw className="h-4 w-4" /> Restore sample</button>
                <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importData} />
              </div>
            </Panel>
          </section>
        )}

        <footer className="footer">
          <Lock className="h-4 w-4" />
          Local-first by default. Signing in saves a plain JSON backup through the project API. {syncCopy.footer}
        </footer>
      </div>

      <LoginPanel
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        mode={authMode}
        onModeChange={setAuthMode}
        onSuccessToken={(nextToken, email) => {
          setToken(nextToken, email);
          setShowLogin(false);
        }}
        api={api}
        theme={data.visualTheme === 'wabi' ? 'wabi-sabi' : 'modern'}
      />
    </main>
  );
}

function getSyncCopy(status: SyncStatus, lastSyncedAt: string | null) {
  switch (status) {
    case 'loading':
      return { label: 'Loading cloud backup', detail: 'Checking server copy', footer: 'Cloud load is in progress.' };
    case 'saving':
      return { label: 'Saved locally', detail: 'Cloud sync queued', footer: 'Local changes are saved first.' };
    case 'syncing':
      return { label: 'Syncing', detail: 'Uploading backup', footer: 'Cloud backup is updating.' };
    case 'synced':
      return { label: 'Synced', detail: lastSyncedAt ? `Last sync ${lastSyncedAt}` : 'Cloud backup current', footer: 'Cloud backup is current.' };
    case 'failed':
      return { label: 'Sync failed', detail: 'Local data is safe', footer: 'Cloud backup needs attention.' };
    case 'local':
    default:
      return { label: 'Local only', detail: 'Sign in to back up', footer: 'No server copy is used while signed out.' };
  }
}

function formatSnapshotDelta(currentTotal: number, snapshotTotal: number, currency: string, compact: boolean, privateMode: boolean) {
  const delta = currentTotal - snapshotTotal;
  if (Math.abs(delta) < 1) return 'No material change';
  const prefix = delta > 0 ? '+' : '-';
  return `${prefix}${mask(formatCurrency(Math.abs(delta), currency, compact), privateMode)} since snapshot`;
}

function cashflowReason(row: AllocationRow & { cashflowDelta: number }, mode: 'deposit' | 'withdraw') {
  const drift = formatPercent(Math.abs(row.drift));
  if (mode === 'deposit') {
    return row.drift < 0 ? `${drift} under target before this deposit` : 'Keeps the target mix balanced after deposit';
  }
  return row.drift > 0 ? `${drift} over target before this withdrawal` : 'Reduces cash need while preserving the target mix';
}

function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" onClick={props.onClick} aria-label={props.label} title={props.label} type="button">
      {React.Children.map(props.children, (child) =>
        React.isValidElement<{ className?: string }>(child) ? React.cloneElement(child, { className: cn('h-4 w-4', child.props.className) }) : child,
      )}
    </button>
  );
}

function Panel(props: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-icon">{props.icon}</div>
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function MetricCard(props: { label: string; value: string; detail: string; tone?: 'good' | 'warn' }) {
  return (
    <article className={cn('metric-card', props.tone === 'good' && 'tone-good', props.tone === 'warn' && 'tone-warn')}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </article>
  );
}

function ConflictSummaryCard(props: {
  title: string;
  summary: ReturnType<typeof summarizePortfolio>;
  compact: boolean;
}) {
  return (
    <article className="conflict-card">
      <span>{props.title}</span>
      <strong>{formatCurrency(props.summary.total, props.summary.baseCurrency, props.compact)}</strong>
      <p>{props.summary.activeCount} active / {props.summary.archivedCount} archived / {props.summary.historyCount} snapshots</p>
    </article>
  );
}

function CategoryPill(props: { category: Category; colors?: Record<Category, string> }) {
  return (
    <span className="category-pill">
      <i style={{ backgroundColor: (props.colors ?? CATEGORY_COLORS)[props.category] }} />
      {props.category}
    </span>
  );
}

function AllocationLine(props: { row: AllocationRow; baseCurrency: string; compact: boolean; privateMode: boolean; colors: Record<Category, string> }) {
  const { row } = props;
  const action = row.actionAmount > 0 ? 'Buy' : 'Sell';
  return (
    <div className="allocation-line">
      <div className="allocation-meta">
        <CategoryPill category={row.category} colors={props.colors} />
        <span>{formatPercent(row.current)} current / {formatPercent(row.target)} target</span>
      </div>
      <div className="allocation-bar" aria-hidden>
        <span style={{ width: `${Math.min(row.current * 100, 100)}%`, backgroundColor: props.colors[row.category] }} />
      </div>
      <div className="allocation-action">
        {row.withinBand ? (
          <span className="good-text">Hold</span>
        ) : (
          <span className={row.actionAmount > 0 ? 'good-text' : 'warn-text'}>
            {action} {mask(formatCurrency(Math.abs(row.actionAmount), props.baseCurrency, props.compact), props.privateMode)}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState(props: { text: string }) {
  return <div className="empty-state">{props.text}</div>;
}
