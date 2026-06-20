import Fastify, { FastifyError, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './lib/config';
import { DataStore, MemoryStore } from './lib/store';
import { PrismaStore } from './lib/prismaStore';
import { authRoutes } from './routes/auth';
import { dataRoutes } from './routes/data';
import { AppMailer, Mailer } from './lib/mailer';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export function buildServer(options: { store?: DataStore; mailer?: Mailer; logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'accessToken', 'token'],
    },
    bodyLimit: 1_048_576,
  });
  const store = options.store ?? (config.dataBackend === 'memory' ? new MemoryStore() : new PrismaStore());
  const mailer = options.mailer ?? new AppMailer();

  app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : process.env.NODE_ENV !== 'production',
    credentials: false,
  });
  app.register(jwt, {
    secret: config.jwtSecret,
    sign: { iss: config.jwtIssuer },
    verify: { allowedIss: [config.jwtIssuer] },
  });

  app.decorate('authenticate', async function authenticate(request) {
    await request.jwtVerify();
    const user = await store.findUserById(request.user.userId);
    if (!user || user.tokenVersion !== request.user.tokenVersion) {
      throw Object.assign(new Error('Session is no longer valid'), { statusCode: 401 });
    }
  });

  app.get('/health', async () => ({ ok: true, service: 'portfolio-harry-browne-backend' }));
  app.register((instance) => authRoutes(instance, store, mailer));
  app.register((instance) => dataRoutes(instance, store));

  app.setErrorHandler((cause: FastifyError, _request, reply) => {
    const status = cause.statusCode && cause.statusCode >= 400 ? cause.statusCode : 500;
    if (status >= 500) app.log.error(cause);
    reply.code(status).send({
      error: {
        code: status === 401 ? 'UNAUTHORIZED' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
        message: status >= 500 ? 'Internal server error' : cause.message,
      },
    });
  });

  app.addHook('onClose', async () => {
    await store.close();
  });
  return app;
}
