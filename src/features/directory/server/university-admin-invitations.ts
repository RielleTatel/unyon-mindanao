import "server-only";

import { z } from "zod";

import type {
  IdentityVerifier,
  PortalActor,
  SessionService,
  SessionTokens,
  TransactionRunner,
} from "@/features/access/server";
import { AccessError, createProtectedOperationFactory } from "@/features/access/server";
import type { InvitationDelivery } from "@/platform/email/contracts";
import type { InvitationPreview, UniversityAdminInvitationRecord } from "../contracts";

export type { InvitationPreview, UniversityAdminInvitationRecord } from "../contracts";

export type InvitedRole = "UNIVERSITY_ADMIN" | "REPRESENTATIVE";

export interface UniversityAdminInvitationRepository {
  listActiveUniversities(): Promise<Array<{ id: string; name: string }>>;
  listPending(occurredAt: Date, role: InvitedRole, universityIds?: string[]): Promise<UniversityAdminInvitationRecord[]>;
  getActiveUniversity(id: string): Promise<{ id: string; name: string } | null>;
  getPending(id: string, occurredAt: Date, role: InvitedRole): Promise<UniversityAdminInvitationRecord | null>;
  createPending(input: {
    id: string;
    tokenHash: string;
    email: string;
    role: InvitedRole;
    universityId: string;
    invitedByPortalUserId: string;
    expiresAt: Date;
  }): Promise<UniversityAdminInvitationRecord>;
  revokePending(id: string, occurredAt: Date, role: InvitedRole): Promise<UniversityAdminInvitationRecord | null>;
}

export interface InvitationAcceptanceRepository {
  preview(tokenHash: string): Promise<InvitationPreview | null>;
  accept(input: {
    tokenHash: string;
    identity: { firebaseUid: string; email: string; emailVerified: boolean };
    fullName: string;
    correlationId: string;
  }): Promise<{ portalUserId: string }>;
}

const idSchema = z.object({ id: z.string().uuid() });
const normalizedEmail = z.string().trim().email().max(320).transform((value) => value.normalize("NFKC").toLowerCase());
const inviteInputSchema = z.object({ email: normalizedEmail, universityId: z.string().uuid() });
const createInputSchema = inviteInputSchema.extend({
  invitationId: z.string().uuid(),
  role: z.enum(["UNIVERSITY_ADMIN", "REPRESENTATIVE"]),
  tokenHash: z.string().length(64).regex(/^[a-f0-9]+$/u),
});
const publicTokenSchema = z.string().min(32).max(256);
const acceptInputSchema = z.object({
  token: publicTokenSchema,
  idToken: z.string().min(1).max(8192),
  correlationId: z.string().min(1).max(160),
  fullName: z.string().transform((value) => value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ")).pipe(z.string().min(2).max(160)),
});
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

export function createUniversityAdminInvitationFeature(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  transactions: TransactionRunner<{
    universityAdminInvitations: UniversityAdminInvitationRepository;
  }>;
  acceptance: InvitationAcceptanceRepository;
  identityVerifier: IdentityVerifier;
  tokens: SessionTokens;
  delivery: InvitationDelivery;
  appOrigin: string;
}) {
  const factory = createProtectedOperationFactory({
    sessions: dependencies.sessions,
    transactions: dependencies.transactions,
  });
  const listPending = factory.query({
    intent: "university-admin-invitation.list",
    input: z.object({}),
    resolveSubject: async () => ({ id: "pending-admins", kind: "UniversityAdminInvitationDirectory" }),
    authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN"),
    execute: ({ transaction, occurredAt }) =>
      transaction.capabilities.universityAdminInvitations.listPending(occurredAt, "UNIVERSITY_ADMIN"),
  });

  const listPendingRepresentatives = factory.query({
    intent: "representative-invitation.list",
    input: z.object({}),
    resolveSubject: async ({ actor }) => ({
      id: "pending-representatives",
      kind: "RepresentativeInvitationDirectory",
      universityIds: actor.appointments
        .filter(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId)
        .map(({ universityId }) => universityId!),
    }),
    authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN"),
    execute: ({ actor, occurredAt, transaction }) =>
      transaction.capabilities.universityAdminInvitations.listPending(
        occurredAt,
        "REPRESENTATIVE",
        actor.appointments.some(({ role }) => role === "SUPER_ADMIN") ? undefined : actor.appointments
          .filter(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId)
          .map(({ universityId }) => universityId!),
      ),
  });

  const managedUniversities = factory.query({
    intent: "representative-invitation.universities",
    input: z.object({}),
    resolveSubject: async () => ({ id: "managed-universities", kind: "MemberUniversityDirectory" }),
    authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN"),
    execute: async ({ actor, transaction }) => {
      if (actor.appointments.some(({ role }) => role === "SUPER_ADMIN")) return transaction.capabilities.universityAdminInvitations.listActiveUniversities();
      const universityIds = [...new Set(actor.appointments
        .filter(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId)
        .map(({ universityId }) => universityId!))];
      const universities = await Promise.all(universityIds.map((id) =>
        transaction.capabilities.universityAdminInvitations.getActiveUniversity(id),
      ));
      return universities.filter((university) => university !== null);
    },
  });

  const createPending = factory.mutation({
    action: "university_admin_invitation.created",
    intent: "university-admin-invitation.create",
    input: createInputSchema,
    resolveSubject: async ({ transaction }, input) => {
      const university = await transaction.capabilities.universityAdminInvitations.getActiveUniversity(input.universityId);
      return university ? {
        id: input.invitationId,
        kind: "Invitation",
        role: input.role,
        universityId: university.id,
        universityName: university.name,
      } : null;
    },
    authorize: ({ actor, subject }) => canInvite(actor, subject.role, subject.universityId),
    execute: async ({ actor, occurredAt, transaction, subject }, input) => {
      const invitation = await transaction.capabilities.universityAdminInvitations.createPending({
        email: input.email,
        expiresAt: new Date(occurredAt.getTime() + sevenDaysMs),
        id: input.invitationId,
        invitedByPortalUserId: actor.portalUserId,
        role: input.role,
        tokenHash: input.tokenHash,
        universityId: subject.universityId,
      });
      return { invitation, universityName: subject.universityName };
    },
    auditMetadata: (result) => ({ role: result.invitation.role, universityId: result.invitation.universityId }),
  });

  const createRepresentative = factory.mutation({
    action: "representative_invitation.created",
    intent: "representative-invitation.create",
    input: createInputSchema,
    resolveSubject: async ({ transaction }, input) => {
      if (input.role !== "REPRESENTATIVE") return null;
      const university = await transaction.capabilities.universityAdminInvitations.getActiveUniversity(input.universityId);
      return university ? {
        id: input.invitationId,
        kind: "Invitation",
        role: input.role,
        universityId: university.id,
        universityName: university.name,
      } : null;
    },
    authorize: ({ actor, subject }) => canInvite(actor, subject.role, subject.universityId),
    execute: async ({ actor, occurredAt, transaction, subject }, input) => {
      const invitation = await transaction.capabilities.universityAdminInvitations.createPending({
        email: input.email,
        expiresAt: new Date(occurredAt.getTime() + sevenDaysMs),
        id: input.invitationId,
        invitedByPortalUserId: actor.portalUserId,
        role: "REPRESENTATIVE",
        tokenHash: input.tokenHash,
        universityId: subject.universityId,
      });
      return { invitation, universityName: subject.universityName };
    },
    auditMetadata: (result) => ({ role: result.invitation.role, universityId: result.invitation.universityId }),
  });

  const revokePending = createRevoker("UNIVERSITY_ADMIN");
  const revokeRepresentativePending = createRevoker("REPRESENTATIVE");

  function createRevoker(role: InvitedRole) {
    return factory.mutation({
      action: role === "REPRESENTATIVE" ? "representative_invitation.revoked" : "university_admin_invitation.revoked",
      intent: role === "REPRESENTATIVE" ? "representative-invitation.revoke" : "university-admin-invitation.revoke",
      input: idSchema,
      resolveSubject: async ({ transaction, occurredAt }, input) => {
        const invitation = await transaction.capabilities.universityAdminInvitations.getPending(input.id, occurredAt, role);
        return invitation ? {
          id: invitation.id,
          kind: "Invitation",
          role: invitation.role,
          universityId: invitation.universityId,
        } : null;
      },
      authorize: ({ actor, subject }) => canInvite(actor, role, subject.universityId),
      execute: async ({ transaction, occurredAt, subject }) => {
        const invitation = await transaction.capabilities.universityAdminInvitations.revokePending(subject.id, occurredAt, role);
        if (!invitation) throw notFoundOrForbidden();
        return invitation;
      },
      auditMetadata: (result) => ({ role: result.role, universityId: result.universityId }),
    });
  }

  async function inviteForRole(request: {
    correlationId: string;
    input: unknown;
    sessionToken: string;
  }, role: InvitedRole) {
    const parsed = inviteInputSchema.safeParse(request.input);
    if (!parsed.success) throw new AccessError("INVALID_INPUT", "Invalid input");
    const rawToken = dependencies.tokens.create();
    const tokenHash = await dependencies.tokens.hash(rawToken);
    const invitationId = crypto.randomUUID();
    const operation = role === "REPRESENTATIVE" ? createRepresentative : createPending;
    const result = await operation({
      ...request,
      input: { ...parsed.data, invitationId, role, tokenHash },
    });

    try {
      const invitationUrl = new URL("/accept-invitation", dependencies.appOrigin);
      invitationUrl.hash = rawToken;
      await dependencies.delivery.send({
        email: result.invitation.email,
        universityName: result.universityName,
        invitationUrl: invitationUrl.toString(),
        ...(role === "REPRESENTATIVE" ? { role } : {}),
      });
    } catch {
      try {
        const revoke = role === "REPRESENTATIVE" ? revokeRepresentativePending : revokePending;
        await revoke({ correlationId: request.correlationId, input: { id: result.invitation.id }, sessionToken: request.sessionToken });
      } catch {
        // Keep delivery errors generic; a successful compensation is recorded in the audit log.
      }
      throw new AccessError("OPERATION_FAILED", "The invitation could not be delivered");
    }

    return result.invitation;
  }

  return {
    listPending,
    listPendingRepresentatives,
    managedUniversities,
    invite: (request: { correlationId: string; input: unknown; sessionToken: string }) => inviteForRole(request, "UNIVERSITY_ADMIN"),
    inviteRepresentative: (request: { correlationId: string; input: unknown; sessionToken: string }) => inviteForRole(request, "REPRESENTATIVE"),
    revoke: revokePending,
    revokeRepresentative: revokeRepresentativePending,
    async preview(rawToken: string) {
      const token = publicTokenSchema.safeParse(rawToken);
      if (!token.success) return null;
      const tokenHash = await dependencies.tokens.hash(token.data);
      return dependencies.acceptance.preview(tokenHash);
    },
    async accept(rawInput: unknown) {
      const parsed = acceptInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new AccessError("INVALID_INPUT", "Invalid input");

      let identity;
      try {
        identity = await dependencies.identityVerifier.verifyIdToken(parsed.data.idToken);
      } catch {
        throw new AccessError("AUTHENTICATION_REQUIRED", "Authentication required");
      }

      if (!identity.emailVerified) throw new AccessError("AUTHENTICATION_REQUIRED", "Authentication required");
      return dependencies.acceptance.accept({
        correlationId: parsed.data.correlationId,
        fullName: parsed.data.fullName,
        identity: {
          email: identity.email,
          emailVerified: identity.emailVerified,
          firebaseUid: identity.firebaseUid,
        },
        tokenHash: await dependencies.tokens.hash(parsed.data.token),
      });
    },
  };
}

function canInvite(actor: PortalActor, role: InvitedRole, universityId: string) {
  if (role === "UNIVERSITY_ADMIN") {
    return actor.appointments.some(({ role: appointmentRole }) => appointmentRole === "SUPER_ADMIN");
  }
  return actor.appointments.some((appointment) =>
    appointment.role === "SUPER_ADMIN" || (appointment.role === "UNIVERSITY_ADMIN" && appointment.universityId === universityId),
  );
}

function notFoundOrForbidden() {
  return new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden");
}
