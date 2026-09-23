import "server-only";
import { z } from "zod";
import { createProtectedOperationFactory, retryDatabaseTransactions, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { FinancialReportRecord } from "../contracts";

export interface FinancialReportRepository {
  list(administrative: boolean): Promise<FinancialReportRecord[]>;
  get(id: string): Promise<FinancialReportRecord | null>;
  create(input: { id: string; title: string; reportingPeriod: string; description: string }): Promise<void>;
  revise(id: string): Promise<void>;
  publish(id: string, revisionId: string, actorId: string, now: Date): Promise<void>;
}

export function createFinancialReportFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ reports: FinancialReportRepository }> }) {
  const factory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  const isAdmin = ({ actor }: { actor: { appointments: { role: string }[] } }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
  return {
    list: factory.query({ intent: "financial-report.list", input: z.object({}), resolveSubject: async () => ({ id: "reports", kind: "FinancialReportDirectory" }), authorize: () => true,
      execute: ({ actor, transaction }) => transaction.capabilities.reports.list(isAdmin({ actor })),
    }),
    create: factory.mutation({ intent: "financial-report.create", action: "financial_report.created", input: z.object({ title: z.string().trim().min(1).max(180), reportingPeriod: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(3000) }),
      resolveSubject: async () => ({ id: crypto.randomUUID(), kind: "FinancialReport" }), authorize: isAdmin,
      execute: async ({ transaction, subject }, input) => { await transaction.capabilities.reports.create({ ...input, id: subject.id }); return { id: subject.id }; },
    }),
    revise: factory.mutation({ intent: "financial-report.revise", action: "financial_report.revision_created", input: z.object({ id: z.string().uuid() }),
      resolveSubject: async ({ transaction }, input) => { const report = await transaction.capabilities.reports.get(input.id); return report ? { id: report.id, kind: "FinancialReport" } : null; }, authorize: isAdmin,
      execute: async ({ transaction, subject }) => { await transaction.capabilities.reports.revise(subject.id); return { id: subject.id }; },
    }),
    publish: factory.mutation({ intent: "financial-report.publish", action: "financial_report.published", input: z.object({ id: z.string().uuid(), revisionId: z.string().uuid() }),
      resolveSubject: async ({ transaction }, input) => { const report = await transaction.capabilities.reports.get(input.id); return report ? { id: report.id, kind: "FinancialReport" } : null; }, authorize: isAdmin,
      execute: async ({ transaction, actor, subject, occurredAt }, input) => { await transaction.capabilities.reports.publish(subject.id, input.revisionId, actor.portalUserId, occurredAt); return { id: subject.id }; },
    }),
  };
}
