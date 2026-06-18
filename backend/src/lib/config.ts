function csv(value: string | undefined) {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  jwtIssuer: process.env.JWT_ISSUER ?? 'portfolio-harry-browne',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigins: csv(process.env.CORS_ORIGINS),
  dataBackend: process.env.DATA_BACKEND ?? 'prisma',
};

export function assertProductionConfig() {
  if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'change-me-in-production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  if (process.env.NODE_ENV === 'production' && config.dataBackend !== 'prisma') {
    throw new Error('Production must use DATA_BACKEND=prisma');
  }
}
