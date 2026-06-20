export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  JWT_ISSUER?: string;
  JWT_EXPIRES_SECONDS?: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  tokenVersion: number;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: number | null;
  verification_hash: string | null;
  verification_expiry: number | null;
  token_version: number;
  failed_login_count: number;
  locked_until: number | null;
}
