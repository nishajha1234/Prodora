import { Prisma, PrismaClient } from '@prisma/client';

declare global {
  var __prodoraPrismaClient: PrismaClient | undefined;
}

export const prisma = globalThis.__prodoraPrismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prodoraPrismaClient = prisma;
}

export type Transaction = Prisma.TransactionClient;

export function withTransaction<T>(
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(work);
}
