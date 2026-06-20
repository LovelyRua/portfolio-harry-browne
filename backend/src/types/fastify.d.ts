import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string; tokenVersion: number };
    user: { userId: string; email: string; tokenVersion: number };
  }
}
