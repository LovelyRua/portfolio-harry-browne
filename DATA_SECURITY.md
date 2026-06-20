# Data Security Notes

The application is local-first. Cloud sync uses a client-side encrypted
envelope before any portfolio data is sent to the API.

## Cloud encryption

- Each upload generates a random AES-256-GCM data key.
- Portfolio JSON is encrypted with that data key in the browser.
- The data key is wrapped with a key derived from the user's login password
  using PBKDF2-SHA256.
- The same data key is also wrapped with the project's RSA-OAEP recovery public
  key.
- The Worker, Fastify backend and D1/PostgreSQL only receive the encrypted
  envelope.
- The login password serves both authentication and local cloud-backup
  decryption. It is sent to the authentication API over HTTPS during login, but
  is not stored in plaintext. The browser also derives the encryption key
  locally from the same password.
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
the user's password and this private key makes encrypted cloud data
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
- The login password is kept in `sessionStorage` for the current browser tab so
  refreshing does not interrupt encrypted sync. It is removed on sign-out and
  normally cleared when the tab or browser session closes. It is never written
  to persistent `localStorage`.
- Metadata such as account email, timestamps and encrypted payload size remains
  visible to the service.
- A forgotten-password reset changes account authentication but cannot decrypt
  cloud backups wrapped by the forgotten password. If the browser still has
  local portfolio data, signing in with the new password will encrypt and sync
  it again. Otherwise the offline recovery private key is required.
