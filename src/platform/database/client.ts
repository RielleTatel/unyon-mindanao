import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "#unyon-prisma-client";

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Cold local route compilation and concurrent serverless requests can exceed
    // Prisma's two-second transaction acquisition default. Keep both bounds finite.
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });
}

export type { PrismaClient } from "#unyon-prisma-client";
