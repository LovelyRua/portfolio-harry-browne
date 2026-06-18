export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  JWT_ISSUER?: string;
  JWT_EXPIRES_SECONDS?: string;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: number | null;
}
