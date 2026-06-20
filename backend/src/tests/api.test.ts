import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../app';
import { MemoryStore } from '../lib/store';
import { Mailer } from '../lib/mailer';

const validPortfolio = {
  version: 1,
  assets: [{ id: 'cash-1', name: 'Cash', category: 'Cash', currency: 'USD', amount: 100 }],
  exchangeRates: { USD: 1 },
  targetAllocations: { Stocks: 0.25, Bonds: 0.25, Gold: 0.25, Cash: 0.25 },
  baseCurrency: 'USD',
};

describe('API', () => {
  let app: FastifyInstance;
  let mailer: TestMailer;

  beforeEach(() => {
    mailer = new TestMailer();
    app = buildServer({ store: new MemoryStore(), mailer, logger: false });
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

  test('requires email verification before login', async () => {
    const auth = { email: 'user@example.test', password: 'ValidPass123' };
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: auth })).statusCode).toBe(201);
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: auth });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('EMAIL_NOT_VERIFIED');

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { email: auth.email, code: mailer.codeFor(auth.email) },
    });
    expect(verify.statusCode).toBe(200);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: auth });
    expect(login.statusCode).toBe(200);
    expect(login.json().accessToken).toBeTypeOf('string');
  });

  test('does not let repeat registration replace an unverified account password', async () => {
    const email = 'pending@example.test';
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'OriginalPass123' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'AttackerPass456' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { email, code: mailer.codeFor(email) },
    });

    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'OriginalPass123' },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'AttackerPass456' },
    })).statusCode).toBe(401);
  });

  test('changes password and invalidates the previous token', async () => {
    const email = 'change@example.test';
    const oldPassword = 'ValidPass123';
    const oldToken = await tokenFor(app, mailer, email, oldPassword);
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${oldToken}` },
      payload: { currentPassword: oldPassword, newPassword: 'NewValidPass456' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().accessToken).toBeTypeOf('string');

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/data',
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(oldSession.statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'NewValidPass456' },
    });
    expect(login.statusCode).toBe(200);
  });

  test('resets a forgotten password and invalidates existing sessions', async () => {
    const email = 'forgot@example.test';
    const oldPassword = 'OriginalPass123';
    const oldToken = await tokenFor(app, mailer, email, oldPassword);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { email, code: mailer.codeFor(email), newPassword: 'ResetValidPass456' },
    })).statusCode).toBe(200);

    expect((await app.inject({
      method: 'GET',
      url: '/api/data',
      headers: { authorization: `Bearer ${oldToken}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: oldPassword },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'ResetValidPass456' },
    })).statusCode).toBe(200);
  });

  test('does not reveal whether a password reset email exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'missing@example.test' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  test('uploads and downloads portfolio data', async () => {
    const token = await tokenFor(app, mailer);
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

  test('stores encrypted cloud envelopes without inspecting plaintext', async () => {
    const token = await tokenFor(app, mailer);
    const encrypted = {
      format: 'pp-e2ee-v1',
      cipher: { algorithm: 'AES-256-GCM', iv: 'aXY=', ciphertext: 'Y2lwaGVydGV4dA==' },
      userKey: {
        algorithm: 'PBKDF2-SHA256+A256GCM',
        iterations: 250000,
        salt: 'c2FsdA==',
        iv: 'aXY=',
        wrappedKey: 'd3JhcHBlZA==',
      },
      recoveryKey: {
        algorithm: 'RSA-OAEP-256',
        keyId: 'recovery-test',
        wrappedKey: 'cmVjb3Zlcnk=',
      },
    };
    const uploaded = await app.inject({
      method: 'PUT',
      url: '/api/data',
      headers: { authorization: `Bearer ${token}` },
      payload: { payload: encrypted },
    });
    expect(uploaded.statusCode).toBe(200);
    const downloaded = await app.inject({
      method: 'GET',
      url: '/api/data',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(downloaded.json().payload).toEqual(encrypted);
  });

  test('rejects invalid portfolio data', async () => {
    const token = await tokenFor(app, mailer);
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

async function tokenFor(
  app: FastifyInstance,
  mailer: TestMailer,
  email = `${crypto.randomUUID()}@example.test`,
  password = 'ValidPass123',
) {
  const auth = { email, password };
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: auth });
  await app.inject({
    method: 'POST',
    url: '/api/auth/verify-email',
    payload: { email: auth.email, code: mailer.codeFor(auth.email) },
  });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: auth });
  return login.json().accessToken as string;
}

class TestMailer implements Mailer {
  private codes = new Map<string, string>();

  async sendVerificationCode(email: string, code: string) {
    this.codes.set(email, code);
  }

  async sendPasswordResetCode(email: string, code: string) {
    this.codes.set(email, code);
  }

  codeFor(email: string) {
    const code = this.codes.get(email);
    if (!code) throw new Error(`No verification code for ${email}`);
    return code;
  }
}
