import { describe, expect, test } from 'vitest';
import { validateAuth, validateUpload } from '../src/validation';

describe('Worker validation', () => {
  test('normalizes valid credentials', () => {
    expect(validateAuth({ email: ' USER@example.com ', password: 'ValidPass123' })).toEqual({
      ok: true,
      value: { email: 'user@example.com', password: 'ValidPass123' },
    });
  });

  test('rejects weak credentials', () => {
    expect(validateAuth({ email: 'bad', password: 'short' }).ok).toBe(false);
  });

  test('accepts a valid portfolio payload', () => {
    expect(validateUpload({
      payload: {
        assets: [{ id: 'cash', name: 'Cash', category: 'Cash', currency: 'USD', amount: 100 }],
        exchangeRates: { USD: 1 },
        targetAllocations: { Cash: 1 },
        baseCurrency: 'USD',
      },
    }).ok).toBe(true);
  });

  test('accepts an encrypted cloud envelope', () => {
    expect(validateUpload({
      payload: {
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
      },
    }).ok).toBe(true);
  });
});
