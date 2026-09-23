import "server-only";

import { z } from "zod";
import { AccessError, createProtectedOperationFactory, requireRecentPassword, retryDatabaseTransactions, type IdentityVerifier, type PortalActor, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { BirthdayRecord, BirthDateSubject, RestrictedBirthDate } from "../contracts";

export interface BirthdayRepository {
  list(month: number, now: Date): Promise<BirthdayRecord[]>;
  subjects(universityIds: string[] | undefined, now: Date): Promise<BirthDateSubject[]>;
  subject(id: string, now: Date): Promise<BirthDateSubject | null>;
  read(id: string): Promise<RestrictedBirthDate>;
  update(id: string, birthDate: string | null, version: number): Promise<void>;
  removeExpired(now: Date): Promise<number>;
}

const restrictedInput = z.object({ id: z.string().uuid(), idToken: z.string().min(1).max(8192) });

export function createBirthdayFeature(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  transactions: TransactionRunner<{ birthdays: BirthdayRepository }>;
  identityVerifier: IdentityVerifier;
}) {
  const factory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  const resolveSubject = async ({ transaction, occurredAt }: { transaction: { capabilities: { birthdays: BirthdayRepository } }; occurredAt: Date }, { id }: { id: string }) => {
    const subject = await transaction.capabilities.birthdays.subject(id, occurredAt);
    return subject ? { ...subject, kind: "PortalUser" } : null;
  };
  return {
    list: factory.query({
      intent: "birthday.list",
      input: z.object({ month: z.number().int().min(1).max(12) }),
      resolveSubject: async () => ({ id: "birthdays", kind: "BirthdayDirectory" }),
      authorize: () => true,
      execute: ({ transaction, occurredAt }, input) => transaction.capabilities.birthdays.list(input.month, occurredAt),
    }),
    manageablePeople: factory.query({
      intent: "birth-date.subjects",
      input: z.object({}),
      resolveSubject: async () => ({ id: "birth-date-subjects", kind: "PortalUserDirectory" }),
      authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN"),
      execute: ({ actor, transaction, occurredAt }) => transaction.capabilities.birthdays.subjects(
        actor.appointments.some(({ role }) => role === "SUPER_ADMIN") ? undefined : actor.appointments.flatMap(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId ? [universityId] : []), occurredAt,
      ),
    }),
    // Restricted reads deliberately use the audited operation boundary.
    read: factory.mutation({
      intent: "birth-date.read",
      action: "birth_date.read",
      input: restrictedInput,
      resolveSubject: (context, input) => resolveSubject(context, input),
      authorize: ({ actor, subject }) => canManage(actor, subject),
      execute: async ({ actor, subject, transaction, occurredAt }, input) => {
        await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt);
        return transaction.capabilities.birthdays.read(subject.id);
      },
    }),
    update: factory.mutation({
      intent: "birth-date.update",
      action: "birth_date.updated",
      input: restrictedInput.extend({ birthDate: z.iso.date().nullable(), version: z.number().int().min(0) }),
      resolveSubject: (context, input) => resolveSubject(context, input),
      authorize: ({ actor, subject }) => canManage(actor, subject),
      execute: async ({ actor, subject, transaction, occurredAt }, input) => {
        await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt);
        const todayInManila = new Date(occurredAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (input.birthDate !== null && (input.birthDate < "0001-01-01" || input.birthDate > todayInManila)) throw new AccessError("INVALID_INPUT", "Birth date must not be in the future");
        await transaction.capabilities.birthdays.update(subject.id, input.birthDate, input.version);
        return { updated: true };
      },
    }),
    removeExpired: factory.mutation({
      intent: "birth-date.retention",
      action: "birth_date.retention_applied",
      input: z.object({ idToken: z.string().min(1).max(8192) }),
      resolveSubject: async () => ({ id: "birth-date-retention", kind: "PortalUserDirectory" }),
      authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN"),
      execute: async ({ actor, transaction, occurredAt }, input) => {
        await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt);
        return { removed: await transaction.capabilities.birthdays.removeExpired(occurredAt) };
      },
      auditMetadata: (result) => ({ removedCount: result.removed }),
    }),
  };
}

function canManage(actor: PortalActor, subject: BirthDateSubject) {
  return actor.appointments.some(({ role, universityId }) => role === "SUPER_ADMIN" || (role === "UNIVERSITY_ADMIN" && universityId !== null && subject.status === "ACTIVE" && subject.activeUniversityIds.includes(universityId)));
}
