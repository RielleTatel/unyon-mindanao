import "server-only";

import type {
  SessionRepository,
  TransactionRunner,
} from "./contracts";
import type { SuperAdminBootstrapRepository } from "./bootstrap";
import { PrismaSessionRepository } from "./prisma-session-repository";
import { PrismaSuperAdminBootstrapRepository } from "./prisma-super-admin-bootstrap";
import { PrismaTransactionRunner } from "./prisma-transaction-runner";
import type { AccessTransaction } from "./prisma-helpers";
import type { PrismaClient } from "@/platform/database/client";

export interface AccessPersistence<
  Capabilities extends object = Record<string, never>,
> {
  sessions: SessionRepository;
  superAdminBootstrap: SuperAdminBootstrapRepository;
  transactions: TransactionRunner<Capabilities>;
}

export function createAccessPersistence<
  Capabilities extends object = Record<string, never>,
>(
  prisma: PrismaClient,
  createCapabilities?: (
    transaction: AccessTransaction,
    occurredAt: Date,
  ) => Capabilities,
): AccessPersistence<Capabilities> {
  return {
    sessions: new PrismaSessionRepository(prisma),
    superAdminBootstrap: new PrismaSuperAdminBootstrapRepository(prisma),
    transactions: new PrismaTransactionRunner(prisma, createCapabilities),
  };
}
