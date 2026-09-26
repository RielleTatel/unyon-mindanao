import "server-only";

import type { Prisma } from "#unyon-prisma-client";

import { AccessError } from "@/features/access/server";
import { databaseNow } from "@/features/access/server/prisma-helpers";
import type { PrismaClient } from "@/platform/database/client";
import type {
  InvitationPreview,
  UniversityAdminInvitationRecord,
} from "../contracts";
import type { InvitedRole, UniversityAdminInvitationRepository } from "./university-admin-invitations";

type Transaction = Prisma.TransactionClient;

export class PrismaUniversityAdminInvitationRepository
  implements UniversityAdminInvitationRepository
{
  constructor(private readonly transaction: Transaction) {}

  async listActiveUniversities() {
    return this.transaction.memberUniversity.findMany({ select: { id: true, name: true }, where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  }

  async listPending(occurredAt: Date, role: InvitedRole, universityIds?: string[]) {
    const records = await this.transaction.invitation.findMany({
      include: { university: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
      where: {
        expiresAt: { gt: occurredAt },
        role,
        status: "PENDING",
        ...(universityIds ? { universityId: { in: universityIds } } : {}),
      },
    });

    return records.map(toInvitationRecord);
  }

  async getActiveUniversity(id: string) {
    return this.transaction.memberUniversity.findFirst({
      select: { id: true, name: true },
      where: { id, status: "ACTIVE" },
    });
  }

  async getPending(id: string, occurredAt: Date, role: InvitedRole) {
    const record = await this.transaction.invitation.findFirst({
      include: { university: { select: { name: true } } },
      where: {
        expiresAt: { gt: occurredAt },
        id,
        role,
        status: "PENDING",
      },
    });

    return record ? toInvitationRecord(record) : null;
  }

  async createPending(input: {
    id: string;
    tokenHash: string;
    email: string;
    role: InvitedRole;
    universityId: string;
    invitedByPortalUserId: string;
    expiresAt: Date;
  }) {
    try {
      const occurredAt = new Date(input.expiresAt.getTime() - sevenDaysMs);
      await this.transaction.invitation.updateMany({
        data: { status: "EXPIRED" },
        where: {
          email: input.email,
          expiresAt: { lte: occurredAt },
          role: input.role,
          status: "PENDING",
          universityId: input.universityId,
        },
      });
      const existingAppointment = await this.transaction.appointment.findFirst({
        select: { id: true },
        where: {
          portalUser: { email: input.email },
          role: input.role,
          universityId: input.universityId,
          startsAt: { lte: occurredAt },
          OR: [{ endsAt: null }, { endsAt: { gt: occurredAt } }],
        },
      });

      if (existingAppointment) {
        throw new AccessError("CONFLICT", `A ${input.role === "REPRESENTATIVE" ? "Representative" : "University Admin"} Appointment already exists`);
      }

      const record = await this.transaction.invitation.create({
        data: {
          ...input,
          role: input.role,
        },
      });
      const recordWithUniversity = await this.transaction.invitation.findUniqueOrThrow({
        include: { university: { select: { name: true } } },
        where: { id: record.id },
      });

      return toInvitationRecord(recordWithUniversity);
    } catch (error) {
      throw mapConstraint(error);
    }
  }

  async revokePending(id: string, occurredAt: Date, role: InvitedRole) {
    const result = await this.transaction.invitation.updateMany({
      data: { revokedAt: occurredAt, status: "REVOKED" },
      where: {
        expiresAt: { gt: occurredAt },
        id,
        role,
        status: "PENDING",
      },
    });

    if (result.count === 0) {
      return null;
    }

    const record = await this.transaction.invitation.findUnique({
      include: { university: { select: { name: true } } },
      where: { id },
    });

    return record ? toInvitationRecord(record) : null;
  }
}

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

export async function previewUniversityAdminInvitation(
  prisma: PrismaClient,
  tokenHash: string,
): Promise<InvitationPreview | null> {
  return prisma.$transaction(async (transaction) => {
    const occurredAt = await databaseNow(transaction);
    const invitation = await transaction.invitation.findFirst({
      include: { university: { select: { name: true, status: true } } },
      where: {
        expiresAt: { gt: occurredAt },
        role: { in: ["UNIVERSITY_ADMIN", "REPRESENTATIVE"] },
        status: "PENDING",
        tokenHash,
      },
    });

    if (!invitation || invitation.university.status !== "ACTIVE") {
      return null;
    }

    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      role: invitation.role === "REPRESENTATIVE" ? "REPRESENTATIVE" : "UNIVERSITY_ADMIN",
      universityName: invitation.university.name,
    };
  });
}

export async function acceptUniversityAdminInvitation(
  prisma: PrismaClient,
  input: {
    tokenHash: string;
    identity: { firebaseUid: string; email: string; emailVerified: boolean };
    fullName: string;
    correlationId: string;
  },
): Promise<{ portalUserId: string }> {
  try {
    return await retrySerialization(() => prisma.$transaction(async (transaction) => {
      const occurredAt = await databaseNow(transaction);
      const invitation = await transaction.invitation.findUnique({
        include: { university: { select: { status: true } } },
        where: { tokenHash: input.tokenHash },
      });

      if (
        !invitation ||
        !["UNIVERSITY_ADMIN", "REPRESENTATIVE"].includes(invitation.role) ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= occurredAt ||
        invitation.university.status !== "ACTIVE"
      ) {
        throw invalidInvitation();
      }

      if (
        !input.identity.emailVerified ||
        input.identity.email.trim().toLowerCase() !== invitation.email
      ) {
        throw new AccessError(
          "INVITATION_EMAIL_MISMATCH",
          "The verified email does not match this invitation",
        );
      }

      const [byUid, byEmail] = await Promise.all([
        transaction.portalUser.findUnique({ where: { firebaseUid: input.identity.firebaseUid } }),
        transaction.portalUser.findUnique({ where: { email: invitation.email } }),
      ]);

      if (
        (byUid && byUid.email !== invitation.email) ||
        (byEmail && byEmail.firebaseUid !== input.identity.firebaseUid)
      ) {
        throw new AccessError("CONFLICT", "The identity is already linked to another Portal User");
      }

      const existingUser = byUid ?? byEmail;

      if (existingUser?.status === "DISABLED") {
        throw new AccessError("CONFLICT", "The Portal User is disabled");
      }

      const portalUser = existingUser ?? await transaction.portalUser.create({
        data: {
          email: invitation.email,
          firebaseUid: input.identity.firebaseUid,
          fullName: input.fullName,
        },
      });

      await transaction.appointment.create({
        data: {
          portalUserId: portalUser.id,
          role: invitation.role,
          startsAt: occurredAt,
          universityId: invitation.universityId,
        },
      });

      const accepted = await transaction.invitation.updateMany({
        data: {
          acceptedAt: occurredAt,
          acceptedByPortalUserId: portalUser.id,
          status: "ACCEPTED",
        },
        where: {
          expiresAt: { gt: occurredAt },
          id: invitation.id,
          status: "PENDING",
        },
      });

      if (accepted.count !== 1) {
        throw invalidInvitation();
      }

      await transaction.auditLog.create({
        data: {
          action: invitation.role === "REPRESENTATIVE"
            ? "representative_invitation.accepted"
            : "university_admin_invitation.accepted",
          actorPortalUserId: portalUser.id,
          correlationId: input.correlationId,
          metadata: {
            role: invitation.role,
            universityId: invitation.universityId,
          },
          occurredAt,
          resourceId: invitation.id,
          resourceType: "Invitation",
        },
      });

      return { portalUserId: portalUser.id };
    }, { isolationLevel: "Serializable" }));
  } catch (error) {
    if (error instanceof AccessError) {
      throw error;
    }

    throw mapConstraint(error);
  }
}

function toInvitationRecord(record: {
  id: string;
  email: string;
  role: "UNIVERSITY_ADMIN" | "SUPER_ADMIN" | "REPRESENTATIVE";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  universityId: string;
  expiresAt: Date;
  createdAt: Date;
  university: { name: string };
}): UniversityAdminInvitationRecord {
  return {
    createdAt: record.createdAt.toISOString(),
    email: record.email,
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    role: record.role === "REPRESENTATIVE" ? "REPRESENTATIVE" : "UNIVERSITY_ADMIN",
    status: record.status,
    universityId: record.universityId,
    universityName: record.university.name,
  };
}

function invalidInvitation() {
  return new AccessError("INVALID_INVITATION", "This invitation is invalid or expired");
}

// Only the rolled-back database transaction is repeated; identity verification
// and session creation remain outside this retry boundary.
async function retrySerialization<Result>(work: () => Promise<Result>): Promise<Result> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const conflict = typeof error === "object" && error !== null && (
        ("code" in error && error.code === "P2034") ||
        ("cause" in error && typeof error.cause === "object" && error.cause !== null && "originalCode" in error.cause && error.cause.originalCode === "40001")
      );
      if (!conflict) throw error;
      if (attempt >= 8) throw new AccessError("OPERATION_FAILED", "Invitation acceptance is busy. Try again.");
      const ceiling = Math.min(500, 40 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * ceiling)));
    }
  }
}

function mapConstraint(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2004" || error.code === "P2034")
  ) {
    return new AccessError("CONFLICT", "The invitation conflicts with current account records");
  }

  return error;
}
