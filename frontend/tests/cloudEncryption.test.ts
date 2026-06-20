import { describe, expect, test } from 'vitest';
import {
  decryptCloudPayload,
  encryptCloudPayload,
  isEncryptedCloudEnvelope,
} from '../src/crypto/cloudEncryption';
import {
  CLOUD_RECOVERY_KEY_ID,
  CLOUD_RECOVERY_PUBLIC_KEY,
} from '../src/config/cloudRecoveryPublicKey';

describe('cloud encryption envelope', () => {
  test('round-trips with the user password and contains no plaintext portfolio', async () => {
    const portfolio = {
      assets: [{ id: 'gold', name: 'Private Gold Holding', amount: 42 }],
      baseCurrency: 'USD',
    };
    const envelope = await encryptCloudPayload(
      portfolio,
      'ValidPass123',
      CLOUD_RECOVERY_PUBLIC_KEY,
      CLOUD_RECOVERY_KEY_ID,
    );

    expect(isEncryptedCloudEnvelope(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain('Private Gold Holding');
    await expect(decryptCloudPayload(envelope, 'ValidPass123')).resolves.toEqual(portfolio);
    await expect(decryptCloudPayload(envelope, 'WrongPass123')).rejects.toThrow('could not be decrypted');
  });
});
