import { FastifyInstance } from 'fastify';
import { DataStore } from '../lib/store';
import { uploadSchema } from '../validators/schemas';

export async function dataRoutes(app: FastifyInstance, store: DataStore) {
  app.get('/api/data', { preHandler: app.authenticate }, async (request) => {
    const data = await store.getData(request.user.userId);
    return {
      payload: data?.payload ?? null,
      ...(data ? { updatedAt: data.updatedAt.toISOString() } : {}),
    };
  });

  app.put('/api/data', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Portfolio payload is invalid',
          details: parsed.error.flatten(),
        },
      });
    }

    const data = await store.saveData(request.user.userId, parsed.data.payload);
    return { ok: true, updatedAt: data.updatedAt.toISOString() };
  });
}
