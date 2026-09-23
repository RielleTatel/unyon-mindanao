import "server-only";

import { z } from "zod";
import { AccessError, createProtectedOperationFactory, requireRecentPassword, retryDatabaseTransactions, type IdentityVerifier, type PortalActor, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { RepresentativeAppointmentRecord } from "../contracts";

export interface RepresentativeAppointmentRepository {
  list(universityIds: string[] | undefined, now: Date): Promise<RepresentativeAppointmentRecord[]>;
  get(id: string, now: Date): Promise<RepresentativeAppointmentRecord | null>;
  end(id: string, portalUserId: string, now: Date): Promise<{ sessionsRevoked: boolean }>;
}

export function createRepresentativeAppointmentFeature(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  identityVerifier: IdentityVerifier;
  transactions: TransactionRunner<{ representativeAppointments: RepresentativeAppointmentRepository }>;
}) {
  const factory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  return {
    list: factory.query({
      intent: "representative-appointment.list",
      input: z.object({}),
      resolveSubject: async () => ({ id: "representatives", kind: "AppointmentDirectory" }),
      authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN"),
      execute: ({ actor, transaction, occurredAt }) => transaction.capabilities.representativeAppointments.list(
        actor.appointments.some(({ role }) => role === "SUPER_ADMIN") ? undefined : actor.appointments.flatMap(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId ? [universityId] : []),
        occurredAt,
      ),
    }),
    end: factory.mutation({
      action: "representative_appointment.ended",
      intent: "representative-appointment.end",
      input: z.object({ id: z.string().uuid(), idToken: z.string().min(1).max(8192) }),
      resolveSubject: async ({ transaction, occurredAt }, { id }) => {
        const appointment = await transaction.capabilities.representativeAppointments.get(id, occurredAt);
        return appointment ? { ...appointment, kind: "Appointment" } : null;
      },
      authorize: ({ actor, subject }) => canManage(actor, subject.universityId),
      execute: async ({ actor, subject, transaction, occurredAt }, input) => {
        await requireRecentPassword(dependencies.identityVerifier, actor, input.idToken, occurredAt);
        if (!subject.active) throw new AccessError("CONFLICT", "This Appointment is no longer active");
        return transaction.capabilities.representativeAppointments.end(subject.id, subject.portalUserId, occurredAt);
      },
      auditMetadata: (result) => ({ sessionsRevoked: result.sessionsRevoked }),
    }),
  };
}

function canManage(actor: PortalActor, universityId: string) {
  return actor.appointments.some((appointment) => appointment.role === "SUPER_ADMIN" || (appointment.role === "UNIVERSITY_ADMIN" && appointment.universityId === universityId));
}
