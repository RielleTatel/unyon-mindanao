import "server-only";

import type { AccessPersistence } from "./persistence";
import { D1SessionRepository } from "./d1-session-repository";
import { D1SuperAdminBootstrapRepository } from "./d1-super-admin-bootstrap";
import {
  D1BatchTransaction,
  D1TransactionRunner,
} from "./d1-transaction-runner";

export function createD1AccessPersistence<
  Capabilities extends object = Record<string, never>,
>(
  database: D1Database,
  createCapabilities?: (
    transaction: D1BatchTransaction,
    occurredAt: Date,
    database: D1Database,
  ) => Capabilities,
): AccessPersistence<Capabilities> {
  return {
    sessions: new D1SessionRepository(database),
    superAdminBootstrap: new D1SuperAdminBootstrapRepository(database),
    transactions: new D1TransactionRunner(database, createCapabilities),
  };
}
