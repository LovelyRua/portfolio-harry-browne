import { z } from 'zod';

export const authSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128)
    .regex(/[a-z]/, 'Password requires a lowercase letter')
    .regex(/[A-Z]/, 'Password requires an uppercase letter')
    .regex(/[0-9]/, 'Password requires a number'),
});

const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  category: z.enum(['Stocks', 'Bonds', 'Gold', 'Cash']),
  currency: z.string().min(3).max(8),
  amount: z.number().finite().nonnegative(),
  note: z.string().max(1000).optional(),
  archivedAt: z.string().optional(),
}).passthrough();

export const portfolioSchema = z.object({
  version: z.number().int().positive().optional(),
  assets: z.array(assetSchema),
  exchangeRates: z.record(z.string(), z.number().finite().nonnegative()),
  targetAllocations: z.record(z.string(), z.number().finite().nonnegative()),
  baseCurrency: z.string().min(3).max(8),
  compactNumbers: z.boolean().optional(),
  privacyMode: z.boolean().optional(),
  darkMode: z.boolean().optional(),
  visualTheme: z.enum(['workbench', 'wabi']).optional(),
  rebalanceBand: z.number().min(0).max(50).optional(),
  history: z.array(z.unknown()).optional(),
}).passthrough();

const encryptedCloudSchema = z.object({
  format: z.literal('pp-e2ee-v1'),
  cipher: z.object({
    algorithm: z.literal('AES-256-GCM'),
    iv: z.string().min(1),
    ciphertext: z.string().min(1).max(400_000),
  }),
  userKey: z.object({
    algorithm: z.literal('PBKDF2-SHA256+A256GCM'),
    iterations: z.number().int().min(100_000).max(1_000_000),
    salt: z.string().min(1),
    iv: z.string().min(1),
    wrappedKey: z.string().min(1),
  }),
  recoveryKey: z.object({
    algorithm: z.literal('RSA-OAEP-256'),
    keyId: z.string().min(1).max(200),
    wrappedKey: z.string().min(1).max(10_000),
  }),
});

export const uploadSchema = z.object({ payload: z.union([portfolioSchema, encryptedCloudSchema]) });
