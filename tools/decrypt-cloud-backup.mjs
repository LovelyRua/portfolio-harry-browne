import { constants, privateDecrypt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [inputArg, privateKeyArg, outputArg] = process.argv.slice(2);
if (!inputArg || !privateKeyArg) {
  console.error('Usage: node tools/decrypt-cloud-backup.mjs <encrypted.json> <private-key.pem> [output.json]');
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(resolve(inputArg), 'utf8'));
if (envelope.format !== 'pp-e2ee-v1') throw new Error('Unsupported encrypted backup format');
const privateKey = readFileSync(resolve(privateKeyArg), 'utf8');
const rawDataKey = privateDecrypt(
  {
    key: privateKey,
    oaepHash: 'sha256',
    padding: constants.RSA_PKCS1_OAEP_PADDING,
  },
  Buffer.from(envelope.recoveryKey.wrappedKey, 'base64'),
);
const cryptoKey = await crypto.subtle.importKey('raw', rawDataKey, 'AES-GCM', false, ['decrypt']);
const plaintext = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv: Buffer.from(envelope.cipher.iv, 'base64') },
  cryptoKey,
  Buffer.from(envelope.cipher.ciphertext, 'base64'),
);
rawDataKey.fill(0);
const decoded = new TextDecoder().decode(plaintext);
const output = outputArg ? resolve(outputArg) : null;
if (output) {
  writeFileSync(output, `${JSON.stringify(JSON.parse(decoded), null, 2)}\n`, { mode: 0o600 });
  console.log(`Decrypted backup written to ${output}`);
} else {
  process.stdout.write(`${JSON.stringify(JSON.parse(decoded), null, 2)}\n`);
}
