import "server-only";

import { AccessError } from "@/features/access/server";
import {
  D1BatchTransaction,
  d1DatabaseNow,
} from "@/features/access/server/d1-transaction-runner";
import type {
  InvitationPreview,
  UniversityAdminInvitationRecord,
} from "../contracts";
import type {
  InvitationAcceptanceRepository,
  InvitedRole,
  UniversityAdminInvitationRepository,
} from "./university-admin-invitations";

interface InvitationRow {
  id: string;
  email: string;
  role: "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  university_id: string;
  university_name: string;
  expires_at: string;
  created_at: string;
}

interface InvitationAcceptanceRow extends InvitationRow {
  token_hash: string;
  university_status: "ACTIVE" | "ARCHIVED";
}

interface ExistingUserRow {
  id: string;
  firebase_uid: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
}

export class D1UniversityAdminInvitationRepository
  implements UniversityAdminInvitationRepository, InvitationAcceptanceRepository
{
  constructor(
    private readonly database: D1Database,
    private readonly transaction?: D1BatchTransaction,
  ) {}

  async listActiveUniversities() {
    const rows = await this.requireTransaction().all<{ id: string; name: string }>(
      "SELECT id, name FROM member_universities WHERE status = 'ACTIVE' ORDER BY name, id",
    );
    return rows;
  }

  async listPending(occurredAt: Date, role: InvitedRole, universityIds?: string[]) {
    if (universityIds?.length === 0) return [];
    const scope = universityIds
      ? `AND i.university_id IN (${universityIds.map(() => "?").join(", ")})`
      : "";
    const rows = await this.requireTransaction().all<InvitationRow>(
      `SELECT i.id, i.email, i.role, i.status, i.university_id,
              u.name AS university_name, i.expires_at, i.created_at
       FROM invitations AS i
       JOIN member_universities AS u ON u.id = i.university_id
       WHERE i.expires_at > ? AND i.role = ? AND i.status = 'PENDING' ${scope}
       ORDER BY i.created_at DESC, i.id`,
      occurredAt.toISOString(),
      role,
      ...(universityIds ?? []),
    );
    return rows.map(toInvitationRecord);
  }

  async getActiveUniversity(id: string) {
    return this.requireTransaction().first<{ id: string; name: string }>(
      "SELECT id, name FROM member_universities WHERE id = ? AND status = 'ACTIVE'",
      id,
    );
  }

  async getPending(id: string, occurredAt: Date, role: InvitedRole) {
    const row = await this.requireTransaction().first<InvitationRow>(
      `SELECT i.id, i.email, i.role, i.status, i.university_id,
              u.name AS university_name, i.expires_at, i.created_at
       FROM invitations AS i
       JOIN member_universities AS u ON u.id = i.university_id
       WHERE i.id = ? AND i.expires_at > ? AND i.role = ? AND i.status = 'PENDING'`,
      id,
      occurredAt.toISOString(),
      role,
    );
    return row ? toInvitationRecord(row) : null;
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
    const transaction = this.requireTransaction();
    const occurredAt = transaction.occurredAt;
    const now = occurredAt.toISOString();
    const existingAppointment = await transaction.first<{ id: string }>(
      `SELECT a.id FROM appointments AS a
       JOIN portal_users AS u ON u.id = a.portal_user_id
       WHERE u.email = ? AND a.role = ? AND a.university_id = ?
         AND a.starts_at <= ? AND (a.ends_at IS NULL OR a.ends_at > ?) LIMIT 1`,
      input.email,
      input.role,
      input.universityId,
      now,
      now,
    );
    if (existingAppointment) {
      throw new AccessError(
        "CONFLICT",
        `A ${input.role === "REPRESENTATIVE" ? "Representative" : "University Admin"} Appointment already exists`,
      );
    }

    transaction.enqueue(
      `UPDATE invitations SET status = 'EXPIRED', updated_at = ?
       WHERE email = ? AND role = ? AND university_id = ?
         AND status = 'PENDING' AND expires_at <= ?`,
      now,
      input.email,
      input.role,
      input.universityId,
      now,
    );
    transaction.enqueueGuard(
      `SELECT 1 FROM member_universities AS u
       WHERE u.id = ? AND u.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM appointments AS a
           JOIN portal_users AS p ON p.id = a.portal_user_id
           WHERE p.email = ? AND a.role = ? AND a.university_id = u.id
             AND a.starts_at <= ? AND (a.ends_at IS NULL OR a.ends_at > ?)
         )`,
      input.universityId,
      input.email,
      input.role,
      now,
      now,
    );
    transaction.enqueue(
      `INSERT INTO invitations
        (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.tokenHash,
      input.email,
      input.role,
      input.universityId,
      input.invitedByPortalUserId,
      input.expiresAt.toISOString(),
      now,
      now,
    );

    return {
      createdAt: now,
      email: input.email,
      expiresAt: input.expiresAt.toISOString(),
      id: input.id,
      role: input.role,
      status: "PENDING" as const,
      universityId: input.universityId,
      universityName: (await this.getActiveUniversity(input.universityId))?.name ?? "",
    };
  }

  async revokePending(id: string, occurredAt: Date, role: InvitedRole) {
    const transaction = this.requireTransaction();
    const invitation = await this.getPending(id, occurredAt, role);
    if (!invitation) return null;
    transaction.enqueueCheckedMutation(
      `UPDATE invitations SET status = 'REVOKED', revoked_at = ?, updated_at = ?
       WHERE id = ? AND role = ? AND status = 'PENDING' AND expires_at > ?`,
      occurredAt.toISOString(),
      occurredAt.toISOString(),
      id,
      role,
      occurredAt.toISOString(),
    );
    return { ...invitation, status: "REVOKED" as const };
  }

  async preview(tokenHash: string): Promise<InvitationPreview | null> {
    const database = this.database.withSession("first-primary");
    const now = await d1DatabaseNow(database);
    const invitation = await readAcceptanceInvitation(database, tokenHash);
    if (!isValidInvitation(invitation, now)) return null;
    return {
      email: invitation.email,
      expiresAt: invitation.expires_at,
      role: invitation.role,
      universityName: invitation.university_name,
    };
  }

  async accept(input: {
    tokenHash: string;
    identity: { firebaseUid: string; email: string; emailVerified: boolean };
    fullName: string;
    correlationId: string;
  }) {
    const database = this.database.withSession("first-primary");
    const occurredAt = await d1DatabaseNow(database);
    const invitation = await readAcceptanceInvitation(database, input.tokenHash);
    if (!isValidInvitation(invitation, occurredAt)) throw invalidInvitation();
    if (
      !input.identity.emailVerified ||
      input.identity.email.trim().toLowerCase() !== invitation.email
    ) {
      throw new AccessError(
        "INVITATION_EMAIL_MISMATCH",
        "The verified email does not match this invitation",
      );
    }

    const matchingUsers = await database.prepare(
      `SELECT id, firebase_uid, email, status FROM portal_users
       WHERE firebase_uid = ? OR email = ?`,
    ).bind(input.identity.firebaseUid, invitation.email).all<ExistingUserRow>();
    if (!matchingUsers.success) throw new Error("D1 invitation identity lookup failed");
    const byUid = matchingUsers.results.find(({ firebase_uid }) => firebase_uid === input.identity.firebaseUid);
    const byEmail = matchingUsers.results.find(({ email }) => email === invitation.email);
    if (
      (byUid && byUid.email !== invitation.email) ||
      (byEmail && byEmail.firebase_uid !== input.identity.firebaseUid)
    ) {
      throw new AccessError("CONFLICT", "The identity is already linked to another Portal User");
    }
    const existingUser = byUid ?? byEmail;
    if (existingUser?.status === "DISABLED") {
      throw new AccessError("CONFLICT", "The Portal User is disabled");
    }

    const portalUserId = existingUser?.id ?? crypto.randomUUID();
    const appointmentId = crypto.randomUUID();
    const transaction = new D1BatchTransaction(database, occurredAt);
    transaction.enqueueGuard(
      `SELECT 1 FROM invitations AS i
       JOIN member_universities AS u ON u.id = i.university_id
       WHERE i.id = ? AND i.token_hash = ? AND i.status = 'PENDING'
         AND i.expires_at > ? AND u.status = 'ACTIVE'`,
      invitation.id,
      input.tokenHash,
      occurredAt.toISOString(),
    );
    transaction.enqueueGuard(
      `SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM portal_users
         WHERE (firebase_uid = ? AND email <> ?) OR (email = ? AND firebase_uid <> ?)
       )`,
      input.identity.firebaseUid,
      invitation.email,
      invitation.email,
      input.identity.firebaseUid,
    );

    if (existingUser) {
      transaction.enqueueGuard(
        `SELECT 1 FROM portal_users
         WHERE id = ? AND firebase_uid = ? AND email = ? AND status = 'ACTIVE'`,
        portalUserId,
        input.identity.firebaseUid,
        invitation.email,
      );
    } else {
      transaction.enqueueCheckedMutation(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM portal_users WHERE firebase_uid = ? OR email = ?
         )`,
        portalUserId,
        input.identity.firebaseUid,
        invitation.email,
        input.fullName,
        occurredAt.toISOString(),
        occurredAt.toISOString(),
        input.identity.firebaseUid,
        invitation.email,
      );
    }

    transaction.enqueue(
      `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      appointmentId,
      portalUserId,
      invitation.role,
      invitation.university_id,
      occurredAt.toISOString(),
      occurredAt.toISOString(),
    );
    transaction.enqueueCheckedMutation(
      `UPDATE invitations
       SET status = 'ACCEPTED', accepted_at = ?, accepted_by_portal_user_id = ?, updated_at = ?
       WHERE id = ? AND status = 'PENDING' AND expires_at > ?`,
      occurredAt.toISOString(),
      portalUserId,
      occurredAt.toISOString(),
      invitation.id,
      occurredAt.toISOString(),
    );
    await transaction.appendAudit({
      action: invitation.role === "REPRESENTATIVE"
        ? "representative_invitation.accepted"
        : "university_admin_invitation.accepted",
      actorPortalUserId: portalUserId,
      correlationId: input.correlationId,
      metadata: { role: invitation.role, universityId: invitation.university_id },
      occurredAt,
      resourceId: invitation.id,
      resourceType: "Invitation",
    });

    try {
      await transaction.commit();
    } catch (error) {
      if (isConstraintFailure(error)) {
        throw new AccessError("CONFLICT", "The invitation conflicts with current account records");
      }
      throw error;
    }
    return { portalUserId };
  }

  private requireTransaction() {
    if (!this.transaction) {
      throw new Error("D1 invitation operations require an access transaction");
    }
    return this.transaction;
  }
}

async function readAcceptanceInvitation(database: D1DatabaseSession, tokenHash: string) {
  return database.prepare(
    `SELECT i.id, i.token_hash, i.email, i.role, i.status, i.university_id,
            u.name AS university_name, u.status AS university_status,
            i.expires_at, i.created_at
     FROM invitations AS i
     JOIN member_universities AS u ON u.id = i.university_id
     WHERE i.token_hash = ? AND i.role IN ('UNIVERSITY_ADMIN', 'REPRESENTATIVE')`,
  ).bind(tokenHash).first<InvitationAcceptanceRow>();
}

function isValidInvitation(
  invitation: InvitationAcceptanceRow | null,
  now: Date,
): invitation is InvitationAcceptanceRow {
  return !!invitation && invitation.status === "PENDING" &&
    invitation.university_status === "ACTIVE" &&
    new Date(invitation.expires_at) > now;
}

function toInvitationRecord(row: InvitationRow): UniversityAdminInvitationRecord {
  return {
    createdAt: row.created_at,
    email: row.email,
    expiresAt: row.expires_at,
    id: row.id,
    role: row.role,
    status: row.status,
    universityId: row.university_id,
    universityName: row.university_name,
  };
}

function invalidInvitation() {
  return new AccessError("INVALID_INVITATION", "This invitation is invalid or expired");
}

function isConstraintFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint failed|unique constraint|foreign key constraint|overlapping appointment/iu.test(message);
}
