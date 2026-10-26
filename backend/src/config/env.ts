import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long.'),
  JWT_ACCESS_TTL_MS: z
    .string()
    .regex(
      /^\d+$/,
      'JWT_ACCESS_TTL_MS must be an integer number of milliseconds.',
    )
    .default('900000'),
  REFRESH_TOKEN_TTL_DAYS: z
    .string()
    .regex(/^\d+$/, 'REFRESH_TOKEN_TTL_DAYS must be an integer number of days.')
    .default('30'),
  RATE_LIMIT_REGISTER: z
    .string()
    .regex(
      /^\d+[:/]\d+(ms|s|m|h|d)$/i,
      'RATE_LIMIT_REGISTER must be "max:window" (e.g. "5:15m").',
    )
    .default('5:15m'),
  RATE_LIMIT_LOGIN: z
    .string()
    .regex(
      /^\d+[:/]\d+(ms|s|m|h|d)$/i,
      'RATE_LIMIT_LOGIN must be "max:window" (e.g. "5:15m").',
    )
    .default('5:15m'),
  RATE_LIMIT_REFRESH: z
    .string()
    .regex(
      /^\d+[:/]\d+(ms|s|m|h|d)$/i,
      'RATE_LIMIT_REFRESH must be "max:window" (e.g. "5:15m").',
    )
    .default('5:15m'),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error('Invalid backend environment configuration.');
  console.error(parsedEnvironment.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnvironment.data;
