import { hashPassword, signToken, verifyPassword, verifyToken } from './crypto';
import { apiError, HttpError, json, readJson } from './http';
import { AuthUser, Env, UserRow } from './types';
import {
  validateAuth,
  validateEmail,
  validatePasswordChange,
  validatePasswordReset,
  validateUpload,
  validateVerification,
} from './validation';

const authRequests = new Map<string, { count: number; resetAt: number }>();
const MAX_AUTH_REQUESTS = 30;
const AUTH_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;
const VERIFICATION_TTL_MS = 10 * 60_000;

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

      if (url.pathname === '/api/auth/register' && request.method === 'POST') return await register(request, env);
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return await login(request, env);
      if (url.pathname === '/api/auth/verify-email' && request.method === 'POST') {
        return await verifyEmail(request, env);
      }
      if (url.pathname === '/api/auth/resend-verification' && request.method === 'POST') {
        return await resendVerification(request, env);
      }
      if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
        return await changePassword(request, env);
      }
      if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
        return await forgotPassword(request, env);
      }
      if (url.pathname === '/api/auth/reset-password' && request.method === 'POST') {
        return await resetPassword(request, env);
      }
      if (url.pathname === '/api/data' && request.method === 'GET') return await getData(request, env);
      if (url.pathname === '/api/data' && request.method === 'PUT') return await putData(request, env);
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

  const existing = await env.DB.prepare(
    'SELECT id, email_verified_at FROM users WHERE email = ?1 LIMIT 1',
  ).bind(parsed.value.email).first<{ id: string; email_verified_at: number | null }>();
  if (existing?.email_verified_at) {
    return apiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
  }

  const now = Date.now();
  const code = createVerificationCode();
  const verificationHash = await digestCode(parsed.value.email, code, env.JWT_SECRET);
  const verificationExpiry = now + VERIFICATION_TTL_MS;
  try {
    if (existing) {
      await env.DB.prepare(
        'UPDATE users SET verification_hash = ?1, verification_expiry = ?2, updated_at = ?3 WHERE id = ?4',
      ).bind(verificationHash, verificationExpiry, now, existing.id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, password_hash, email_verified_at, verification_hash,
          verification_expiry, token_version, created_at, updated_at
        ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, 0, ?6, ?6)
      `).bind(
        crypto.randomUUID(),
        parsed.value.email,
        await hashPassword(parsed.value.password),
        verificationHash,
        verificationExpiry,
        now,
      ).run();
    }
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return apiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }
    throw error;
  }
  await sendVerificationCode(env, parsed.value.email, code);
  return json({ ok: true, verificationRequired: true }, 201);
}

async function login(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateAuth(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Invalid email or password', parsed.details);

  const user = await env.DB.prepare(`
    SELECT id, email, password_hash, email_verified_at, verification_hash,
      verification_expiry, token_version, failed_login_count, locked_until
    FROM users WHERE email = ?1 LIMIT 1
  `).bind(parsed.value.email).first<UserRow>();
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
  if (!user.email_verified_at) {
    return apiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in');
  }

  if (user.failed_login_count || user.locked_until) {
    await env.DB.prepare(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ?1 WHERE id = ?2',
    ).bind(now, user.id).run();
  }
  return issueToken(env, {
    userId: user.id,
    email: user.email,
    tokenVersion: user.token_version,
  });
}

async function verifyEmail(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateVerification(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Enter a valid email and 6-digit code');

  const user = await env.DB.prepare(`
    SELECT id, email_verified_at, verification_hash, verification_expiry
    FROM users WHERE email = ?1 LIMIT 1
  `).bind(parsed.value.email).first<{
    id: string;
    email_verified_at: number | null;
    verification_hash: string | null;
    verification_expiry: number | null;
  }>();
  if (!user) return apiError(400, 'INVALID_VERIFICATION_CODE', 'The verification code is invalid');
  if (user.email_verified_at) return json({ ok: true });
  if (!user.verification_hash || !user.verification_expiry || user.verification_expiry < Date.now()) {
    return apiError(400, 'VERIFICATION_CODE_EXPIRED', 'The verification code has expired');
  }
  const actual = await digestCode(parsed.value.email, parsed.value.code, env.JWT_SECRET);
  if (!timingSafeStringEqual(actual, user.verification_hash)) {
    return apiError(400, 'INVALID_VERIFICATION_CODE', 'The verification code is invalid');
  }

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE users
    SET email_verified_at = ?1, verification_hash = NULL, verification_expiry = NULL, updated_at = ?1
    WHERE id = ?2
  `).bind(now, user.id).run();
  return json({ ok: true });
}

async function resendVerification(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateEmail(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Enter a valid email');

  const user = await env.DB.prepare(
    'SELECT id, email_verified_at FROM users WHERE email = ?1 LIMIT 1',
  ).bind(parsed.value.email).first<{ id: string; email_verified_at: number | null }>();
  if (user && !user.email_verified_at) {
    const code = createVerificationCode();
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE users
      SET verification_hash = ?1, verification_expiry = ?2, updated_at = ?3
      WHERE id = ?4
    `).bind(
      await digestCode(parsed.value.email, code, env.JWT_SECRET),
      now + VERIFICATION_TTL_MS,
      now,
      user.id,
    ).run();
    await sendVerificationCode(env, parsed.value.email, code);
  }
  return json({ ok: true });
}

async function changePassword(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const auth = await authenticate(request, env);
  if (auth instanceof Response) return auth;
  const parsed = validatePasswordChange(await readJson(request, 16_384));
  if (!parsed.ok) {
    return apiError(400, 'VALIDATION_ERROR', 'The new password does not meet the requirements', parsed.details);
  }

  const user = await env.DB.prepare(
    'SELECT password_hash, token_version FROM users WHERE id = ?1 LIMIT 1',
  ).bind(auth.userId).first<{ password_hash: string; token_version: number }>();
  if (!user || !(await verifyPassword(parsed.value.currentPassword, user.password_hash))) {
    return apiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
  }
  if (await verifyPassword(parsed.value.newPassword, user.password_hash)) {
    return apiError(400, 'PASSWORD_UNCHANGED', 'New password must be different');
  }

  const tokenVersion = user.token_version + 1;
  await env.DB.prepare(`
    UPDATE users
    SET password_hash = ?1, token_version = ?2, failed_login_count = 0,
      locked_until = NULL, updated_at = ?3
    WHERE id = ?4
  `).bind(await hashPassword(parsed.value.newPassword), tokenVersion, Date.now(), auth.userId).run();
  return issueToken(env, { ...auth, tokenVersion });
}

async function forgotPassword(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validateEmail(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Enter a valid email');
  const user = await env.DB.prepare(
    'SELECT id, email_verified_at FROM users WHERE email = ?1 LIMIT 1',
  ).bind(parsed.value.email).first<{ id: string; email_verified_at: number | null }>();
  if (user?.email_verified_at) {
    const code = createVerificationCode();
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE users SET password_reset_hash = ?1, password_reset_expiry = ?2, updated_at = ?3
      WHERE id = ?4
    `).bind(
      await digestCode(`reset:${parsed.value.email}`, code, env.JWT_SECRET),
      now + VERIFICATION_TTL_MS,
      now,
      user.id,
    ).run();
    await sendCode(env, parsed.value.email, code, 'Reset your Permanent Portfolio Planner password', 'password reset');
  }
  return json({ ok: true });
}

async function resetPassword(request: Request, env: Env) {
  const limited = applyAuthRateLimit(request);
  if (limited) return limited;
  const parsed = validatePasswordReset(await readJson(request, 16_384));
  if (!parsed.ok) return apiError(400, 'VALIDATION_ERROR', 'Password reset details are invalid');
  const user = await env.DB.prepare(`
    SELECT id, password_reset_hash, password_reset_expiry
    FROM users WHERE email = ?1 LIMIT 1
  `).bind(parsed.value.email).first<{
    id: string;
    password_reset_hash: string | null;
    password_reset_expiry: number | null;
  }>();
  const actual = await digestCode(`reset:${parsed.value.email}`, parsed.value.code, env.JWT_SECRET);
  if (!user?.password_reset_hash || !user.password_reset_expiry
    || user.password_reset_expiry < Date.now()
    || !timingSafeStringEqual(actual, user.password_reset_hash)) {
    return apiError(400, 'INVALID_RESET_CODE', 'The password reset code is invalid or expired');
  }
  await env.DB.prepare(`
    UPDATE users SET password_hash = ?1, token_version = token_version + 1,
      password_reset_hash = NULL, password_reset_expiry = NULL,
      failed_login_count = 0, locked_until = NULL, updated_at = ?2
    WHERE id = ?3
  `).bind(await hashPassword(parsed.value.newPassword), Date.now(), user.id).run();
  return json({ ok: true });
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
  if (!user) return apiError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
  const record = await env.DB.prepare(
    'SELECT token_version FROM users WHERE id = ?1 LIMIT 1',
  ).bind(user.userId).first<{ token_version: number }>();
  return record && record.token_version === user.tokenVersion
    ? user
    : apiError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
}

async function issueToken(env: Env, user: AuthUser) {
  const issuer = env.JWT_ISSUER ?? 'portfolio-harry-browne';
  const expires = positiveInteger(env.JWT_EXPIRES_SECONDS, 604_800);
  const accessToken = await signToken(user, env.JWT_SECRET, issuer, expires);
  return json({ accessToken, tokenType: 'Bearer' });
}

function createVerificationCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return value.toString().padStart(6, '0');
}

async function digestCode(email: string, code: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${email}:${code}`));
  return bytesToHex(new Uint8Array(digest));
}

async function sendVerificationCode(env: Env, email: string, code: string) {
  return sendCode(env, email, code, 'Verify your Permanent Portfolio Planner account', 'verification');
}

async function sendCode(env: Env, email: string, code: string, subject: string, purpose: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new HttpError(503, 'EMAIL_NOT_CONFIGURED', 'Email verification is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject,
      text: `Your ${purpose} code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your ${purpose} code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes.</p>`,
    }),
  });
  if (!response.ok) {
    const responseText = (await response.text()).slice(0, 1_000);
    console.error('Verification email delivery failed', response.status, responseText);
    throw new HttpError(502, 'EMAIL_SEND_FAILED', 'Verification email could not be sent');
  }
}

function timingSafeStringEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
