import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyReply } from 'fastify';
import { compare, hash } from 'bcryptjs';
import { config } from '../lib/config';
import { Mailer } from '../lib/mailer';
import { DataStore, StoredUser } from '../lib/store';
import {
  authSchema,
  changePasswordSchema,
  emailSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/schemas';

const failures = new Map<string, { count: number; lockedUntil: number }>();
const requests = new Map<string, { count: number; resetAt: number }>();
const VERIFICATION_TTL_MS = 10 * 60_000;

export async function authRoutes(app: FastifyInstance, store: DataStore, mailer: Mailer) {
  failures.clear();
  requests.clear();
  app.post('/api/auth/register', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Invalid email or password', parsed.error.flatten()));
    }

    const existing = await store.findUserByEmail(parsed.data.email);
    if (existing?.emailVerifiedAt) {
      return reply.code(409).send(error('EMAIL_EXISTS', 'An account with this email already exists'));
    }

    const code = createVerificationCode();
    const verificationHash = digestCode(parsed.data.email, code);
    const verificationExpiry = new Date(Date.now() + VERIFICATION_TTL_MS);
    if (existing) {
      await store.setEmailVerification(existing.id, verificationHash, verificationExpiry);
    } else {
      await store.createUser(
        parsed.data.email,
        await hash(parsed.data.password, 12),
        verificationHash,
        verificationExpiry,
      );
    }
    await mailer.sendVerificationCode(parsed.data.email, code);
    return reply.code(201).send({ ok: true, verificationRequired: true });
  });

  app.post('/api/auth/verify-email', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Enter a valid email and 6-digit code'));
    }

    const user = await store.findUserByEmail(parsed.data.email);
    if (!user || user.emailVerifiedAt) {
      return user?.emailVerifiedAt
        ? { ok: true }
        : reply.code(400).send(error('INVALID_VERIFICATION_CODE', 'The verification code is invalid'));
    }
    if (!user.verificationHash || !user.verificationExpiry || user.verificationExpiry.getTime() < Date.now()) {
      return reply.code(400).send(error('VERIFICATION_CODE_EXPIRED', 'The verification code has expired'));
    }
    if (!matchesCode(parsed.data.email, parsed.data.code, user.verificationHash)) {
      return reply.code(400).send(error('INVALID_VERIFICATION_CODE', 'The verification code is invalid'));
    }

    await store.markEmailVerified(user.id);
    return { ok: true };
  });

  app.post('/api/auth/resend-verification', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Enter a valid email'));
    }

    const user = await store.findUserByEmail(parsed.data.email);
    if (user && !user.emailVerifiedAt) {
      const code = createVerificationCode();
      await store.setEmailVerification(
        user.id,
        digestCode(user.email, code),
        new Date(Date.now() + VERIFICATION_TTL_MS),
      );
      await mailer.sendVerificationCode(user.email, code);
    }
    return { ok: true };
  });

  app.post('/api/auth/login', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Invalid email or password', parsed.error.flatten()));
    }

    const state = failures.get(parsed.data.email);
    if (state && state.lockedUntil > Date.now()) {
      return reply.code(429).send(error('ACCOUNT_LOCKED', 'Too many failed sign-in attempts. Try again later.'));
    }

    const user = await store.findUserByEmail(parsed.data.email);
    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      const count = (state?.count ?? 0) + 1;
      failures.set(parsed.data.email, {
        count,
        lockedUntil: count >= 5 ? Date.now() + 15 * 60_000 : 0,
      });
      return reply.code(401).send(error('INVALID_CREDENTIALS', 'Email or password is incorrect'));
    }
    if (!user.emailVerifiedAt) {
      return reply.code(403).send(error('EMAIL_NOT_VERIFIED', 'Verify your email before signing in'));
    }

    failures.delete(parsed.data.email);
    return issueToken(reply, user);
  });

  app.post('/api/auth/forgot-password', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(error('VALIDATION_ERROR', 'Enter a valid email'));
    const user = await store.findUserByEmail(parsed.data.email);
    if (user?.emailVerifiedAt) {
      const code = createVerificationCode();
      await store.setPasswordReset(
        user.id,
        digestCode(`reset:${user.email}`, code),
        new Date(Date.now() + VERIFICATION_TTL_MS),
      );
      await mailer.sendPasswordResetCode(user.email, code);
    }
    return { ok: true };
  });

  app.post('/api/auth/reset-password', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Password reset details are invalid'));
    }
    const user = await store.findUserByEmail(parsed.data.email);
    if (!user?.passwordResetHash || !user.passwordResetExpiry
      || user.passwordResetExpiry.getTime() < Date.now()
      || !matchesCode(`reset:${parsed.data.email}`, parsed.data.code, user.passwordResetHash)) {
      return reply.code(400).send(error('INVALID_RESET_CODE', 'The password reset code is invalid or expired'));
    }
    await store.updatePassword(user.id, await hash(parsed.data.newPassword, 12));
    failures.delete(user.email);
    return { ok: true };
  });

  app.post(
    '/api/auth/change-password',
    { preHandler: [authRateLimit, app.authenticate] },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(error('VALIDATION_ERROR', 'The new password does not meet the requirements', parsed.error.flatten()));
      }

      const user = await store.findUserById(request.user.userId);
      if (!user || !(await compare(parsed.data.currentPassword, user.passwordHash))) {
        return reply.code(401).send(error('INVALID_CURRENT_PASSWORD', 'Current password is incorrect'));
      }
      if (await compare(parsed.data.newPassword, user.passwordHash)) {
        return reply.code(400).send(error('PASSWORD_UNCHANGED', 'New password must be different'));
      }

      const tokenVersion = await store.updatePassword(user.id, await hash(parsed.data.newPassword, 12));
      return issueToken(reply, { ...user, tokenVersion });
    },
  );
}

function createVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function digestCode(email: string, code: string) {
  return createHmac('sha256', config.jwtSecret).update(`${email}:${code}`).digest('hex');
}

function matchesCode(email: string, code: string, expected: string) {
  const actual = Buffer.from(digestCode(email, code), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

async function issueToken(
  reply: FastifyReply,
  user: Pick<StoredUser, 'id' | 'email' | 'tokenVersion'>,
) {
  const accessToken = await reply.jwtSign(
    { userId: user.id, email: user.email, tokenVersion: user.tokenVersion },
    { expiresIn: config.jwtExpiresIn },
  );
  return { accessToken, tokenType: 'Bearer' };
}

async function authRateLimit(request: { ip: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const now = Date.now();
  const current = requests.get(request.ip);
  const state = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + 15 * 60_000 }
    : { ...current, count: current.count + 1 };
  requests.set(request.ip, state);
  if (state.count > 30) {
    return reply.code(429).send(error('RATE_LIMITED', 'Too many authentication requests. Try again later.'));
  }
}

function error(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
