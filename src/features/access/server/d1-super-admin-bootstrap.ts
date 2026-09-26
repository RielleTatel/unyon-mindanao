import "server-only";

import type { SuperAdminBootstrapRepository } from "./bootstrap";
import { D1BatchTransaction, d1DatabaseNow } from "./d1-transaction-runner";

interface PortalUserRow {
  id: string;
  email: string;
  firebase_uid: string;
  full_name: string;
  status: "ACTIVE" | "DISABLED";
}

interface AppointmentRow {
  id: string;
}

export class D1SuperAdminBootstrapRepository
  implements SuperAdminBootstrapRepository
{
  constructor(private readonly database: D1Database) {}

  async bootstrap(
    input: Parameters<SuperAdminBootstrapRepository["bootstrap"]>[0],
  ) {
    const database = this.database.withSession("first-primary");
    const occurredAt = await d1DatabaseNow(database);
    const users = await database
      .prepare(
        `SELECT id, firebase_uid, email, full_name, status
         FROM portal_users
         WHERE firebase_uid = ? OR email = ?`,
      )
      .bind(input.firebaseUid, input.email)
      .all<PortalUserRow>();
    if (!users.success) throw new Error("D1 bootstrap user lookup failed");

    const byUid = users.results.find(({ firebase_uid }) => firebase_uid === input.firebaseUid);
    const byEmail = users.results.find(({ email }) => email === input.email);
    if (
      (byUid && byUid.email !== input.email) ||
      (byEmail && byEmail.firebase_uid !== input.firebaseUid)
    ) {
      throw new Error("Bootstrap identity conflicts with an existing user");
    }

    const portalUserId = byUid?.id ?? crypto.randomUUID();
    const activeAppointment = byUid
      ? await database
          .prepare(
            `SELECT id FROM appointments
             WHERE portal_user_id = ?
               AND role = 'SUPER_ADMIN'
               AND university_id IS NULL
               AND starts_at <= ?
               AND (ends_at IS NULL OR ends_at > ?)
             ORDER BY starts_at, id LIMIT 1`,
          )
          .bind(portalUserId, occurredAt.toISOString(), occurredAt.toISOString())
          .first<AppointmentRow>()
      : null;

    if (byUid && !activeAppointment) {
      const scheduledAppointment = await database
        .prepare(
          `SELECT id FROM appointments
           WHERE portal_user_id = ?
             AND role = 'SUPER_ADMIN'
             AND university_id IS NULL
             AND starts_at > ?
           LIMIT 1`,
        )
        .bind(portalUserId, occurredAt.toISOString())
        .first<AppointmentRow>();
      if (scheduledAppointment) {
        throw new Error("Bootstrap conflicts with a scheduled Super Admin appointment");
      }
    }

    const created = !byUid || !activeAppointment;
    const appointmentId = activeAppointment?.id ?? crypto.randomUUID();
    const transaction = new D1BatchTransaction(database, occurredAt);

    if (byUid) {
      transaction.enqueueCheckedMutation(
        `UPDATE portal_users
         SET full_name = ?, status = 'ACTIVE', updated_at = ?
         WHERE id = ? AND firebase_uid = ? AND email = ?`,
        input.fullName,
        occurredAt.toISOString(),
        portalUserId,
        input.firebaseUid,
        input.email,
      );
    } else {
      transaction.enqueue(
        `INSERT INTO portal_users
          (id, firebase_uid, email, full_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        portalUserId,
        input.firebaseUid,
        input.email,
        input.fullName,
        occurredAt.toISOString(),
        occurredAt.toISOString(),
      );
    }

    if (activeAppointment) {
      transaction.enqueueGuard(
        `SELECT 1 FROM appointments
         WHERE id = ? AND portal_user_id = ? AND role = 'SUPER_ADMIN'
           AND university_id IS NULL AND starts_at <= ?
           AND (ends_at IS NULL OR ends_at > ?)`,
        activeAppointment.id,
        portalUserId,
        occurredAt.toISOString(),
        occurredAt.toISOString(),
      );
    } else {
      transaction.enqueueGuard(
        `SELECT 1 FROM portal_users AS u
         WHERE u.id = ? AND u.firebase_uid = ? AND u.email = ?
           AND NOT EXISTS (
             SELECT 1 FROM appointments AS a
             WHERE a.portal_user_id = u.id AND a.role = 'SUPER_ADMIN'
               AND a.university_id IS NULL AND a.starts_at > ?
           )`,
        portalUserId,
        input.firebaseUid,
        input.email,
        occurredAt.toISOString(),
      );
      transaction.enqueue(
        `INSERT INTO appointments
          (id, portal_user_id, role, university_id, starts_at, created_at)
         VALUES (?, ?, 'SUPER_ADMIN', NULL, ?, ?)`,
        appointmentId,
        portalUserId,
        occurredAt.toISOString(),
        occurredAt.toISOString(),
      );
    }

    await transaction.appendAudit({
      action: created ? "super_admin.bootstrapped" : "super_admin.confirmed",
      actorPortalUserId: portalUserId,
      correlationId: input.correlationId,
      metadata: { created },
      occurredAt,
      resourceId: appointmentId,
      resourceType: "Appointment",
    });
    await transaction.commit();

    return { appointmentId, created, portalUserId };
  }
}
