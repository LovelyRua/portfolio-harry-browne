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
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
};

export function assertProductionConfig() {
  if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'change-me-in-production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  if (process.env.NODE_ENV === 'production' && config.dataBackend !== 'prisma') {
    throw new Error('Production must use DATA_BACKEND=prisma');
  }
  if (process.env.NODE_ENV === 'production' && (!config.resendApiKey || !config.emailFrom)) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be configured in production');
  }
}
