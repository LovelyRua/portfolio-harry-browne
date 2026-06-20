import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const privatePath = resolve(process.argv[2] ?? '.recovery/cloud-recovery-private-key.pem');
const publicPath = resolve(process.argv[3] ?? 'frontend/src/config/cloudRecoveryPublicKey.ts');
const keyId = process.argv[4] ?? `recovery-${new Date().toISOString().slice(0, 10)}`;
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(dirname(privatePath), { recursive: true });
mkdirSync(dirname(publicPath), { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(
  publicPath,
  `export const CLOUD_RECOVERY_KEY_ID = ${JSON.stringify(keyId)};\n`
    + `export const CLOUD_RECOVERY_PUBLIC_KEY = ${JSON.stringify(publicKey)};\n`,
);
console.log(`Recovery private key written to ${privatePath}`);
console.log(`Recovery public key module written to ${publicPath}`);
