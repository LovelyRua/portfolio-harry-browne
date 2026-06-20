import { describe, expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../src/crypto';

describe('Worker password hashing', () => {
  test('uses the Cloudflare-supported PBKDF2 iteration limit', async () => {
    const encoded = await hashPassword('ValidPass123');

    expect(encoded.startsWith('pbkdf2-sha256$100000$')).toBe(true);
    await expect(verifyPassword('ValidPass123', encoded)).resolves.toBe(true);
    await expect(verifyPassword('WrongPass123', encoded)).resolves.toBe(false);
  });

  test('rejects legacy unsupported iteration counts without throwing', async () => {
    const legacy = 'pbkdf2-sha256$120000$c2FsdA$aGFzaA';

    await expect(verifyPassword('ValidPass123', legacy)).resolves.toBe(false);
  });
});
