# Data Security Notes

The application is local-first. Cloud sync uses a client-side encrypted
envelope before any portfolio data is sent to the API.

## Cloud encryption

- Each upload generates a random AES-256-GCM data key.
- Portfolio JSON is encrypted with that data key in the browser.
- The data key is wrapped with a key derived from the user's separate cloud
  encryption passphrase using PBKDF2-SHA256.
- The same data key is also wrapped with the project's RSA-OAEP recovery public
  key.
- The Worker, Fastify backend and D1/PostgreSQL only receive the encrypted
  envelope.
- Account passwords and encryption passphrases serve different purposes. The
  encryption passphrase is never sent to the API.
- Legacy plaintext cloud backups can still be loaded. Their next successful
  sync migrates them to the encrypted format.

This is recoverable client-side encryption, not zero-access encryption: whoever
holds the offline recovery private key can decrypt cloud backups.

## Recovery key custody

The tracked public key is:

`frontend/src/config/cloudRecoveryPublicKey.ts`

The generated private key is intentionally ignored by Git:

`.recovery/cloud-recovery-private-key.pem`

Copy that private key to an encrypted offline location. Never put it in GitHub
Secrets, Cloudflare, the frontend bundle, ordinary backups or chat. Losing both
the user's passphrase and this private key makes encrypted cloud data
unrecoverable.

To decrypt an exported D1 `payload` value:

```powershell
node tools/decrypt-cloud-backup.mjs encrypted.json .recovery/cloud-recovery-private-key.pem decrypted.json
```

To deliberately rotate the recovery key:

```powershell
node tools/generate-recovery-key.mjs
```

Rotation only affects future uploads. Keep every historical private key as long
as backups encrypted for its matching `keyId` may still exist.

## Remaining limitations

- Browser local storage is only as safe as the device and browser profile.
- An XSS vulnerability running in the application origin could access decrypted
  data while the app is open.
- The encryption passphrase is held in memory for the signed-in page session.
  Reloading requires signing in and entering it again.
- Metadata such as account email, timestamps and encrypted payload size remains
  visible to the service.
