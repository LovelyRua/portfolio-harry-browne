import { FastifyInstance } from 'fastify';
import { compare, hash } from 'bcryptjs';
import { DataStore } from '../lib/store';
import { authSchema } from '../validators/schemas';

const failures = new Map<string, { count: number; lockedUntil: number }>();
const requests = new Map<string, { count: number; resetAt: number }>();

export async function authRoutes(app: FastifyInstance, store: DataStore) {
  app.post('/api/auth/register', { preHandler: authRateLimit }, async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(error('VALIDATION_ERROR', 'Invalid email or password', parsed.error.flatten()));
    }

    if (await store.findUserByEmail(parsed.data.email)) {
      return reply.code(409).send(error('EMAIL_EXISTS', 'An account with this email already exists'));
    }

    await store.createUser(parsed.data.email, await hash(parsed.data.password, 12));
    return reply.code(201).send({ ok: true });
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

    failures.delete(parsed.data.email);
    const accessToken = await reply.jwtSign(
      { userId: user.id, email: user.email },
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    );
    return { accessToken, tokenType: 'Bearer' };
  });
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
