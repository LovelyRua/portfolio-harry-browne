import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../app';
import { MemoryStore } from '../lib/store';

const validPortfolio = {
  version: 1,
  assets: [{ id: 'cash-1', name: 'Cash', category: 'Cash', currency: 'USD', amount: 100 }],
  exchangeRates: { USD: 1 },
  targetAllocations: { Stocks: 0.25, Bonds: 0.25, Gold: 0.25, Cash: 0.25 },
  baseCurrency: 'USD',
};

describe('API', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer({ store: new MemoryStore(), logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  test('health endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: 'portfolio-harry-browne-backend' });
  });

  test('rejects unauthenticated data reads', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/data' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  test('rejects invalid registration data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bad', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('registers and logs in', async () => {
    const auth = { email: 'user@example.test', password: 'ValidPass123' };
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: auth })).statusCode).toBe(201);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: auth });
    expect(login.statusCode).toBe(200);
    expect(login.json().accessToken).toBeTypeOf('string');
  });

  test('uploads and downloads portfolio data', async () => {
    const token = await tokenFor(app);
    const uploaded = await app.inject({
      method: 'PUT',
      url: '/api/data',
      headers: { authorization: `Bearer ${token}` },
      payload: { payload: validPortfolio },
    });
    expect(uploaded.statusCode).toBe(200);
    const downloaded = await app.inject({
      method: 'GET',
      url: '/api/data',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(downloaded.json().payload.assets[0].name).toBe('Cash');
  });

  test('rejects invalid portfolio data', async () => {
    const token = await tokenFor(app);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/data',
      headers: { authorization: `Bearer ${token}` },
      payload: { payload: { assets: 'invalid' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects malformed JSON consistently', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: 'not-json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
  });
});

async function tokenFor(app: FastifyInstance) {
  const auth = { email: `${crypto.randomUUID()}@example.test`, password: 'ValidPass123' };
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: auth });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: auth });
  return login.json().accessToken as string;
}
