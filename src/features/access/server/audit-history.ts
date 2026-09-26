import "server-only";
import { z } from "zod";
import type { Prisma } from "#unyon-prisma-client";
import type { TransactionRunner } from "./contracts";
import type { SessionService } from "./session-service";
import { createProtectedOperationFactory } from "./protected-operation";
import { withAccessRuntime } from "./runtime";
import type { D1BatchTransaction } from "./d1-transaction-runner";

export interface AuditHistoryRepository {
  recent(): Promise<Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: string;
    actorName: string;
  }>>;
}

export class PrismaAuditHistoryRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async recent() {
    const rows = await this.transaction.auditLog.findMany({ take: 100, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { id: true, action: true, resourceType: true, resourceId: true, occurredAt: true, actor: { select: { fullName: true } } } });
    return rows.map(({ occurredAt, actor, ...record }) => ({ ...record, occurredAt: occurredAt.toISOString(), actorName: actor?.fullName ?? "System" }));
  }
}
export class D1AuditHistoryRepository implements AuditHistoryRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async recent() {
    return this.transaction.all<{
      id: string;
      action: string;
      resource_type: string;
      resource_id: string;
      occurred_at: string;
      actor_name: string | null;
    }>(
      `SELECT l.id, l.action, l.resource_type, l.resource_id, l.occurred_at,
              u.full_name AS actor_name
       FROM audit_logs AS l
       LEFT JOIN portal_users AS u ON u.id = l.actor_portal_user_id
       ORDER BY l.occurred_at DESC, l.id DESC LIMIT 100`,
    ).then((rows) => rows.map(({ resource_type, resource_id, occurred_at, actor_name, ...record }) => ({
      ...record,
      resourceType: resource_type,
      resourceId: resource_id,
      occurredAt: new Date(occurred_at).toISOString(),
      actorName: actor_name ?? "System",
    })));
  }
}
export function createAuditHistoryFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ auditHistory: AuditHistoryRepository }> }) {
  const factory = createProtectedOperationFactory(dependencies);
  return { recent: factory.query({ intent: "audit.history", input: z.object({}), resolveSubject: async () => ({ id: "audit-history", kind: "AuditDirectory" }), authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN"), execute: ({ transaction }) => transaction.capabilities.auditHistory.recent() }) };
}
export function withAuditHistory<Result>(work: (feature: ReturnType<typeof createAuditHistoryFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("./d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ auditHistory: AuditHistoryRepository }, Result>(
        (sessions, persistence) => work(createAuditHistoryFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ auditHistory: new D1AuditHistoryRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ auditHistory: PrismaAuditHistoryRepository }, Result>((sessions, persistence) => work(createAuditHistoryFeature({ sessions, transactions: persistence.transactions })), (transaction) => ({ auditHistory: new PrismaAuditHistoryRepository(transaction) }));
}
