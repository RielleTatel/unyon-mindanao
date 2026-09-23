import "server-only";
import { z } from "zod";
import type { Prisma } from "#unyon-prisma-client";
import { AccessError, createProtectedOperationFactory, requireRecentPassword, retryDatabaseTransactions, withAccessRuntime, type IdentityVerifier, type SessionService, type TransactionRunner } from "@/features/access/server";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";

export class PrismaAccountRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  list() { return this.transaction.portalUser.findMany({ select: { id: true, fullName: true, email: true, status: true }, orderBy: { fullName: "asc" } }); }
  get(id: string) { return this.transaction.portalUser.findUnique({ where: { id }, select: { id: true, status: true } }); }
  async setStatus(id: string, status: "ACTIVE" | "DISABLED", now: Date) {
    await this.transaction.portalUser.update({ where: { id }, data: { status } });
    await this.transaction.portalSession.updateMany({ where: { portalUserId: id, revokedAt: null }, data: { revokedAt: now } });
  }
  async appointments() {
    const records = await this.transaction.appointment.findMany({ where: { role: "UNIVERSITY_ADMIN" }, select: { id: true, portalUserId: true, startsAt: true, endsAt: true, portalUser: { select: { fullName: true } }, university: { select: { name: true } } }, orderBy: { startsAt: "desc" } });
    return records.map((record) => ({ ...record, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt?.toISOString() ?? null }));
  }
  appointment(id: string) { return this.transaction.appointment.findFirst({ where: { id, role: "UNIVERSITY_ADMIN" }, select: { id: true, portalUserId: true, startsAt: true, endsAt: true } }); }
  async endAppointment(id: string, userId: string, now: Date) {
    await this.transaction.appointment.update({ where: { id }, data: { endsAt: now } });
    const remaining = await this.transaction.appointment.count({ where: { portalUserId: userId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } });
    if (!remaining) await this.transaction.portalSession.updateMany({ where: { portalUserId: userId, revokedAt: null }, data: { revokedAt: now } });
  }
}
export function createAccountFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ accounts: PrismaAccountRepository }>; identityVerifier: IdentityVerifier }) {
  const factory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  const admin = ({ actor }: { actor: { appointments: { role: string }[] } }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
  return {
    list: factory.query({ intent: "account.administration", input: z.object({}), resolveSubject: async () => ({ id: "accounts", kind: "PortalUserDirectory" }), authorize: admin,
      execute: async ({ transaction }) => ({ people: await transaction.capabilities.accounts.list(), appointments: await transaction.capabilities.accounts.appointments() }),
    }),
    setStatus: factory.mutation({ intent: "account.status", action: "account.status_changed", input: z.object({ id: z.string().uuid(), status: z.enum(["ACTIVE", "DISABLED"]), idToken: z.string().min(1).max(8192) }),
      resolveSubject: async ({ transaction }, input) => { const record = await transaction.capabilities.accounts.get(input.id); return record ? { ...record, kind: "PortalUser" } : null; },
      authorize: (context) => admin(context) && context.actor.portalUserId !== context.subject.id,
      execute: async ({ actor, transaction, subject, occurredAt }, input) => { await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt); await transaction.capabilities.accounts.setStatus(subject.id, input.status, occurredAt); return { saved: true }; },
      auditMetadata: (_result, input) => ({ status: input.status }),
    }),
    endAppointment: factory.mutation({ intent: "university-admin-appointment.end", action: "university_admin_appointment.ended", input: z.object({ id: z.string().uuid(), idToken: z.string().min(1).max(8192) }),
      resolveSubject: async ({ transaction }, input) => { const record = await transaction.capabilities.accounts.appointment(input.id); return record ? { ...record, kind: "Appointment" } : null; }, authorize: admin,
      execute: async ({ actor, transaction, subject, occurredAt }, input) => {
        await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt);
        if (subject.startsAt > occurredAt || (subject.endsAt && subject.endsAt <= occurredAt)) throw new AccessError("CONFLICT", "Appointment is not active");
        await transaction.capabilities.accounts.endAppointment(subject.id, subject.portalUserId, occurredAt); return { saved: true };
      },
    }),
  };
}
export function withAccountFeature<Result>(work: (feature: ReturnType<typeof createAccountFeature>) => Promise<Result>) {
  return withAccessRuntime<{ accounts: PrismaAccountRepository }, Result>((sessions, persistence) => work(createAccountFeature({ sessions, transactions: persistence.transactions, identityVerifier: createFirebaseIdentityVerifier({ projectId: process.env.FIREBASE_PROJECT_ID!, emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined }) })), (transaction) => ({ accounts: new PrismaAccountRepository(transaction) }));
}
