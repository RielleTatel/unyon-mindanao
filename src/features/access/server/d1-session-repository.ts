import "server-only";

import type {
  PortalActor,
  SessionRepository,
  SessionStartRecord,
} from "./contracts";
import { D1BatchTransaction, d1DatabaseNow } from "./d1-transaction-runner";

interface UserRow {
  id: string;
  firebase_uid: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
}

interface AppointmentRow {
  id: string;
  role: PortalActor["appointments"][number]["role"];
  university_id: string | null;
}

interface SessionActorRow extends UserRow, AppointmentRow {
  portal_user_id: string;
  appointment_id: string | null;
  university_id: string | null;
}

export class D1SessionRepository implements SessionRepository {
  constructor(private readonly database: D1Database) {}

  async start({
    correlationId,
    identity,
    maximumLifetimeSeconds,
    tokenHash,
  }: Parameters<SessionRepository["start"]>[0]): Promise<SessionStartRecord | null> {
    const database = this.database.withSession("first-primary");
    const occurredAt = await d1DatabaseNow(database);
    const user = await database
      .prepare(
        `SELECT id, firebase_uid, email, status
         FROM portal_users
         WHERE firebase_uid = ? AND email = ? AND status = 'ACTIVE'`,
      )
      .bind(identity.firebaseUid, identity.email.toLowerCase())
      .first<UserRow>();

    if (!user) return null;

    const appointments = await this.activeAppointments(
      database,
      user.id,
      occurredAt,
    );
    if (appointments.length === 0) return null;

    const expiresAt = new Date(
      occurredAt.getTime() + maximumLifetimeSeconds * 1000,
    );
    const sessionId = crypto.randomUUID();
    const transaction = new D1BatchTransaction(database, occurredAt);
    const appointmentIds = appointments.map(({ id }) => id);
    transaction.enqueueGuard(
      `SELECT 1
       FROM portal_users AS u
       WHERE u.id = ?
         AND u.firebase_uid = ?
         AND u.email = ?
         AND u.status = 'ACTIVE'
         AND (
           SELECT COUNT(*) FROM appointments AS a
           WHERE a.portal_user_id = u.id
             AND a.id IN (${appointmentIds.map(() => "?").join(", ")})
             AND a.starts_at <= ?
             AND (a.ends_at IS NULL OR a.ends_at > ?)
         ) = ?`,
      user.id,
      identity.firebaseUid,
      identity.email.toLowerCase(),
      ...appointmentIds,
      occurredAt.toISOString(),
      occurredAt.toISOString(),
      appointmentIds.length,
    );
    transaction.enqueue(
      `INSERT INTO portal_sessions (id, portal_user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      user.id,
      tokenHash,
      expiresAt.toISOString(),
      occurredAt.toISOString(),
    );
    await transaction.appendAudit({
      action: "session.started",
      actorPortalUserId: user.id,
      correlationId,
      metadata: { expiresAt: expiresAt.toISOString() },
      occurredAt,
      resourceId: sessionId,
      resourceType: "PortalSession",
    });
    await transaction.commit();

    return {
      actor: toPortalActor(user, appointments),
      expiresAt,
    };
  }

  async resolve({ tokenHash }: Parameters<SessionRepository["resolve"]>[0]) {
    const database = this.database.withSession("first-primary");
    const occurredAt = await d1DatabaseNow(database);
    const rows = await database
      .prepare(
        `SELECT
           u.id AS portal_user_id,
           u.firebase_uid,
           u.email,
           u.status,
           a.id AS appointment_id,
           a.role,
           a.university_id
         FROM portal_sessions AS s
         JOIN portal_users AS u ON u.id = s.portal_user_id
         LEFT JOIN appointments AS a
           ON a.portal_user_id = u.id
          AND a.starts_at <= ?
          AND (a.ends_at IS NULL OR a.ends_at > ?)
         WHERE s.token_hash = ?
           AND s.expires_at > ?
           AND s.revoked_at IS NULL
         ORDER BY a.starts_at, a.id`,
      )
      .bind(
        occurredAt.toISOString(),
        occurredAt.toISOString(),
        tokenHash,
        occurredAt.toISOString(),
      )
      .all<SessionActorRow>();

    if (!rows.success) throw new Error("D1 session lookup failed");
    const first = rows.results[0];
    const appointments = rows.results.flatMap((row) =>
      row.appointment_id && row.role
        ? [{
            id: row.appointment_id,
            role: row.role,
            universityId: row.university_id,
          }]
        : [],
    );

    if (!first || first.status !== "ACTIVE" || appointments.length === 0) {
      return null;
    }

    return {
      appointments,
      email: first.email,
      firebaseUid: first.firebase_uid,
      portalUserId: first.portal_user_id,
    } satisfies PortalActor;
  }

  async end({
    correlationId,
    tokenHash,
  }: Parameters<SessionRepository["end"]>[0]) {
    const database = this.database.withSession("first-primary");
    const occurredAt = await d1DatabaseNow(database);
    const session = await database
      .prepare(
        `SELECT id, portal_user_id, revoked_at
         FROM portal_sessions WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{ id: string; portal_user_id: string; revoked_at: string | null }>();

    if (!session || session.revoked_at) return;

    const transaction = new D1BatchTransaction(database, occurredAt);
    transaction.enqueueCheckedMutation(
      `UPDATE portal_sessions SET revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
      occurredAt.toISOString(),
      session.id,
    );
    await transaction.appendAudit({
      action: "session.ended",
      actorPortalUserId: session.portal_user_id,
      correlationId,
      metadata: {},
      occurredAt,
      resourceId: session.id,
      resourceType: "PortalSession",
    });
    await transaction.commit();
  }

  private async activeAppointments(
    database: D1DatabaseSession,
    portalUserId: string,
    occurredAt: Date,
  ) {
    const result = await database
      .prepare(
        `SELECT id, role, university_id
         FROM appointments
         WHERE portal_user_id = ?
           AND starts_at <= ?
           AND (ends_at IS NULL OR ends_at > ?)
         ORDER BY starts_at, id`,
      )
      .bind(portalUserId, occurredAt.toISOString(), occurredAt.toISOString())
      .all<AppointmentRow>();
    if (!result.success) throw new Error("D1 Appointment lookup failed");
    return result.results.map(({ id, role, university_id }) => ({
      id,
      role,
      universityId: university_id,
    }));
  }
}

function toPortalActor(user: UserRow, appointments: PortalActor["appointments"]): PortalActor {
  return {
    appointments,
    email: user.email,
    firebaseUid: user.firebase_uid,
    portalUserId: user.id,
  };
}
