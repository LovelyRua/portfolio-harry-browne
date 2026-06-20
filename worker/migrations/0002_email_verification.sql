ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN verification_hash TEXT;
ALTER TABLE users ADD COLUMN verification_expiry INTEGER;
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- Accounts created before email verification existed remain usable.
UPDATE users
SET email_verified_at = updated_at
WHERE email_verified_at IS NULL;
