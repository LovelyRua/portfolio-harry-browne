const encoder = new TextEncoder();
const decoder = new TextDecoder();
const USER_KDF_ITERATIONS = 250_000;

export type EncryptedCloudEnvelope = {
  format: 'pp-e2ee-v1';
  cipher: {
    algorithm: 'AES-256-GCM';
    iv: string;
    ciphertext: string;
  };
  userKey: {
    algorithm: 'PBKDF2-SHA256+A256GCM';
    iterations: number;
    salt: string;
    iv: string;
    wrappedKey: string;
  };
  recoveryKey: {
    algorithm: 'RSA-OAEP-256';
    keyId: string;
    wrappedKey: string;
  };
};

export async function encryptCloudPayload(
  payload: unknown,
  passphrase: string,
  recoveryPublicKeyPem: string,
  recoveryKeyId: string,
): Promise<EncryptedCloudEnvelope> {
  requirePassphrase(passphrase);
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawDataKey = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
  const dataIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: dataIv },
    dataKey,
    encoder.encode(JSON.stringify(payload)),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const userIv = crypto.getRandomValues(new Uint8Array(12));
  const userKey = await deriveUserKey(passphrase, salt, USER_KDF_ITERATIONS);
  const userWrappedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: userIv },
    userKey,
    rawDataKey,
  );

  const recoveryKey = await importRecoveryPublicKey(recoveryPublicKeyPem);
  const recoveryWrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recoveryKey, rawDataKey);

  rawDataKey.fill(0);
  return {
    format: 'pp-e2ee-v1',
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: toBase64(dataIv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    },
    userKey: {
      algorithm: 'PBKDF2-SHA256+A256GCM',
      iterations: USER_KDF_ITERATIONS,
      salt: toBase64(salt),
      iv: toBase64(userIv),
      wrappedKey: toBase64(new Uint8Array(userWrappedKey)),
    },
    recoveryKey: {
      algorithm: 'RSA-OAEP-256',
      keyId: recoveryKeyId,
      wrappedKey: toBase64(new Uint8Array(recoveryWrappedKey)),
    },
  };
}

export async function decryptCloudPayload<T>(envelope: EncryptedCloudEnvelope, passphrase: string): Promise<T> {
  requirePassphrase(passphrase);
  if (!isEncryptedCloudEnvelope(envelope)) throw new Error('Cloud backup encryption format is invalid');
  const userKey = await deriveUserKey(
    passphrase,
    fromBase64(envelope.userKey.salt),
    envelope.userKey.iterations,
  );
  try {
    const rawDataKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.userKey.iv) },
      userKey,
      fromBase64(envelope.userKey.wrappedKey),
    );
    const dataKey = await crypto.subtle.importKey('raw', rawDataKey, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) },
      dataKey,
      fromBase64(envelope.cipher.ciphertext),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error('Cloud backup could not be decrypted. Sign in with the password used to create it.');
  }
}

export function isEncryptedCloudEnvelope(value: unknown): value is EncryptedCloudEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedCloudEnvelope>;
  return envelope.format === 'pp-e2ee-v1'
    && envelope.cipher?.algorithm === 'AES-256-GCM'
    && typeof envelope.cipher.iv === 'string'
    && typeof envelope.cipher.ciphertext === 'string'
    && envelope.userKey?.algorithm === 'PBKDF2-SHA256+A256GCM'
    && Number.isInteger(envelope.userKey.iterations)
    && typeof envelope.userKey.salt === 'string'
    && typeof envelope.userKey.iv === 'string'
    && typeof envelope.userKey.wrappedKey === 'string'
    && envelope.recoveryKey?.algorithm === 'RSA-OAEP-256'
    && typeof envelope.recoveryKey.keyId === 'string'
    && typeof envelope.recoveryKey.wrappedKey === 'string';
}

async function deriveUserKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importRecoveryPublicKey(pem: string) {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/gu, '');
  return crypto.subtle.importKey(
    'spki',
    fromBase64(body),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

function requirePassphrase(passphrase: string) {
  if (passphrase.length < 10) throw new Error('Cloud encryption password is unavailable');
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
