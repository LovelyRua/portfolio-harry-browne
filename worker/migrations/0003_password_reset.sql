ALTER TABLE users ADD COLUMN password_reset_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_expiry INTEGER;
