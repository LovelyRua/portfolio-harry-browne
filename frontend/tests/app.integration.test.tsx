import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../src/App';
import { AuthProvider } from '../src/auth/AuthContext';
import { AppData, CURRENT_DATA_VERSION } from '../src/dataModel';

vi.mock('../src/AllocationCharts', () => ({
  AllocationCharts: () => <div aria-label="Allocation charts" />,
}));

const STORAGE_KEY = 'permanent_portfolio_dashboard_v2';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe('portfolio app integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('signs in, loads cloud state, and exposes the synced status', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/login') && init?.method === 'POST') {
        return jsonResponse({ accessToken: 'test-token', tokenType: 'Bearer' });
      }
      if (url.endsWith('/data') && init?.method === 'GET') {
        return jsonResponse({ payload: null, updatedAt: '2026-06-18T03:00:00.000Z' });
      }
      if (url.endsWith('/data') && init?.method === 'PUT') {
        return jsonResponse({ ok: true, updatedAt: '2026-06-18T03:00:01.000Z' });
      }
      return jsonResponse({ error: { message: 'Unexpected request' } }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Sync' }));
    const signInDialog = screen.getByRole('dialog', { name: 'Sign in' });
    expect(signInDialog).toBeVisible();

    await user.type(within(signInDialog).getByLabelText('Email'), 'qa@example.test');
    await user.type(within(signInDialog).getByLabelText('Password'), 'ValidPass123');
    const encryptionInput = within(signInDialog)
      .getByText('Cloud encryption passphrase')
      .closest('label')
      ?.querySelector('input');
    expect(encryptionInput).not.toBeNull();
    await user.type(encryptionInput!, 'PrivateCloudPass123');
    await user.click(within(signInDialog).getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('qa@example.test')).toBeVisible());
    await waitFor(() => expect(screen.getByText('Synced')).toBeVisible());
    expect(localStorage.getItem('auth_token')).toBe('test-token');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/login$/),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/data$/),
      expect.objectContaining({ method: 'GET' }),
    );
    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(uploadCall).toBeDefined();
      const body = String(uploadCall?.[1]?.body);
      expect(body).toContain('pp-e2ee-v1');
      expect(body).not.toContain('US Total Market ETF');
    });
  });

  test('edits an asset and persists the updated portfolio locally', async () => {
    const user = userEvent.setup();
    const saved: AppData = {
      version: CURRENT_DATA_VERSION,
      assets: [{
        id: 'asset-1',
        name: 'Original Treasury',
        category: 'Bonds',
        currency: 'USD',
        amount: 1000,
      }],
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    vi.stubGlobal('fetch', vi.fn());

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Assets' }));

    const row = screen.getByText('Original Treasury').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole('button', { name: 'Edit asset' }));

    const nameInput = within(row!).getByDisplayValue('Original Treasury');
    const amountInput = within(row!).getByDisplayValue('1000');
    await user.clear(nameInput);
    await user.type(nameInput, 'Long Treasury');
    await user.clear(amountInput);
    await user.type(amountInput, '1250');
    await user.click(within(row!).getByRole('button', { name: 'Save asset' }));

    expect(await screen.findByText('Long Treasury')).toBeVisible();
    expect(screen.getByText('Asset updated.').closest('[role="status"]')).toBeVisible();
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as AppData;
      expect(persisted.assets[0]).toMatchObject({
        id: 'asset-1',
        name: 'Long Treasury',
        amount: 1250,
      });
    });
  });
});
