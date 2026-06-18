import { hashPassword, signToken, verifyPassword, verifyToken } from './crypto';
import { apiError, HttpError, json, readJson } from './http';
import { AuthUser, Env, UserRow } from './types';
import { validateAuth, validateUpload } from './validation';

const authRequests = new Map<string, { count: number; resetAt: number }>();
const MAX_AUTH_REQUESTS = 30;
const AUTH_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'portfolio-harry-browne-worker' });
      }
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        return apiError(500, 'CONFIG_ERROR', 'Worker secret is not configured');
      }

      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        return register(request, env);
      }
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return login(request, env);
      }
      if (url.pathname === '/api/data' && request.method === 'GET') {
        return getData(request, env);
      }
      if (url.pathname === '/api/data' && request.method === 'PUT') {
        return putData(request, env);
      }
      return apiError(404, 'NOT_FOUND', 'Route not found');
    } catch (error) {
      if (error instanceof HttpError) return apiError(error.status, error.code, error.message, error.details);
      console.error('Unhandled Worker error', error);
      return apiError(500, 'INTERNAL_ERROR', 'Internal server error');
    }
  },
};

async function register(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateAuth(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Invalid email or password', parsed.details);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1 LIMIT 1')
    .bind(parsed.value.email).first<{ id: string }>();
  if (existing) return apiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');

  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)',
    ).bind(crypto.randomUUID(), parsed.value.email, await hashPassword(parsed.value.password), now).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) return apiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    throw error;
  }
  return json({ ok: true }, 201);
}

async function login(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateAuth(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Invalid email or password', parsed.details);

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, failed_login_count, locked_until FROM users WHERE email = ?1 LIMIT 1',
  ).bind(parsed.value.email).first<UserRow>();
  const now = Date.now();
  if (user?.locked_until && user.locked_until > now) {
    return apiError(429, 'ACCOUNT_LOCKED', 'Too many failed sign-in attempts. Try again later.');
  }
  if (!user || !(await verifyPassword(parsed.value.password, user.password_hash))) {
    if (user) {
      const failures = user.failed_login_count + 1;
      await env.DB.prepare(
        'UPDATE users SET failed_login_count = ?1, locked_until = ?2, updated_at = ?3 WHERE id = ?4',
      ).bind(failures, failures >= MAX_FAILED_LOGINS ? now + LOCKOUT_MS : null, now, user.id).run();
    }
    return apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  if (user.failed_login_count || user.locked_until) {
    await env.DB.prepare(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ?1 WHERE id = ?2',
    ).bind(now, user.id).run();
  }
  const issuer = env.JWT_ISSUER ?? 'portfolio-harry-browne';
  const expires = positiveInteger(env.JWT_EXPIRES_SECONDS, 604_800);
  const accessToken = await signToken({ userId: user.id, email: user.email }, env.JWT_SECRET, issuer, expires);
  return json({ accessToken, tokenType: 'Bearer' });
}

async function getData(request: Request, env: Env) {
  const user = await authenticate(request, env);
  if (user instanceof Response) return user;
  const record = await env.DB.prepare(
    'SELECT payload, updated_at FROM user_data WHERE user_id = ?1 LIMIT 1',
  ).bind(user.userId).first<{ payload: string; updated_at: number }>();
  return json({
    payload: record ? JSON.parse(record.payload) : null,
    ...(record ? { updatedAt: new Date(record.updated_at).toISOString() } : {}),
  });
}

async function putData(request: Request, env: Env) {
  const user = await authenticate(request, env);
  if (user instanceof Response) return user;
  const parsed = validateUpload(await readJson(request));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Portfolio payload is invalid', parsed.details);

  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO user_data (user_id, payload, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).bind(user.userId, JSON.stringify(parsed.value.payload), now).run();
  return json({ ok: true, updatedAt: new Date(now).toISOString() });
}

async function authenticate(request: Request, env: Env): Promise<AuthUser | Response> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return apiError(401, 'UNAUTHORIZED', 'Missing Authorization header');
  }
  const user = await verifyToken(
    authorization.slice('Bearer '.length),
    env.JWT_SECRET,
    env.JWT_ISSUER ?? 'portfolio-harry-browne',
  );
  return user ?? apiError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
}

function applyAuthRateLimit(request: Request) {
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now();
  const current = authRequests.get(key);
  const state = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + AUTH_WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  authRequests.set(key, state);
  if (state.count > MAX_AUTH_REQUESTS) {
    return apiError(429, 'RATE_LIMITED', 'Too many authentication requests. Try again later.');
  }
  if (authRequests.size > 5_000) {
    for (const [storedKey, value] of authRequests) {
      if (value.resetAt <= now) authRequests.delete(storedKey);
    }
  }
  return null;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
