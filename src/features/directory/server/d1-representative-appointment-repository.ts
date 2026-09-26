import "server-only";

import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { RepresentativeAppointmentRepository } from "./representative-appointments";

interface AppointmentRow {
  id: string;
  portal_user_id: string;
  university_id: string;
  starts_at: string;
  ends_at: string | null;
  full_name: string;
  email: string;
  user_status: "ACTIVE" | "DISABLED";
  university_name: string;
}

export class D1RepresentativeAppointmentRepository
  implements RepresentativeAppointmentRepository
{
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list(universityIds: string[] | undefined, now: Date) {
    if (universityIds?.length === 0) return [];
    const rows = await this.transaction.all<AppointmentRow>(
      `SELECT a.id, a.portal_user_id, a.university_id, a.starts_at, a.ends_at,
              u.full_name, u.email, u.status AS user_status, m.name AS university_name
       FROM appointments AS a
       JOIN portal_users AS u ON u.id = a.portal_user_id
       JOIN member_universities AS m ON m.id = a.university_id
       WHERE a.role = 'REPRESENTATIVE'
         ${universityIds ? `AND a.university_id IN (${universityIds.map(() => "?").join(", ")})` : ""}
       ORDER BY a.starts_at DESC, a.id ASC`,
      ...(universityIds ?? []),
    );
    return rows.map((row) => toRecord(row, now));
  }

  async get(id: string, now: Date) {
    const row = await this.transaction.first<AppointmentRow>(
      `SELECT a.id, a.portal_user_id, a.university_id, a.starts_at, a.ends_at,
              u.full_name, u.email, u.status AS user_status, m.name AS university_name
       FROM appointments AS a
       JOIN portal_users AS u ON u.id = a.portal_user_id
       JOIN member_universities AS m ON m.id = a.university_id
       WHERE a.id = ? AND a.role = 'REPRESENTATIVE'`,
      id,
    );
    return row ? toRecord(row, now) : null;
  }

  async end(id: string, portalUserId: string, now: Date) {
    const nowIso = now.toISOString();
    const remaining = await this.transaction.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointments
       WHERE portal_user_id = ? AND id <> ? AND starts_at <= ?
         AND (ends_at IS NULL OR ends_at > ?)`,
      portalUserId,
      id,
      nowIso,
      nowIso,
    );
    const remainingCount = remaining?.count ?? 0;
    this.transaction.enqueueGuard(
      `SELECT COUNT(*) FROM appointments
       WHERE portal_user_id = ? AND id <> ? AND starts_at <= ?
         AND (ends_at IS NULL OR ends_at > ?)
       HAVING COUNT(*) = ?`,
      portalUserId,
      id,
      nowIso,
      nowIso,
      remainingCount,
    );
    this.transaction.enqueueCheckedMutation(
      `UPDATE appointments SET ends_at = ?
       WHERE id = ? AND portal_user_id = ? AND role = 'REPRESENTATIVE'
         AND starts_at < ? AND (ends_at IS NULL OR ends_at > ?)`,
      nowIso,
      id,
      portalUserId,
      nowIso,
      nowIso,
    );
    if (remainingCount === 0) {
      this.transaction.enqueue(
        `UPDATE portal_sessions SET revoked_at = ?
         WHERE portal_user_id = ? AND revoked_at IS NULL`,
        nowIso,
        portalUserId,
      );
    }
    return { sessionsRevoked: remainingCount === 0 };
  }
}

function toRecord(row: AppointmentRow, now: Date) {
  return {
    active:
      row.user_status === "ACTIVE" &&
      new Date(row.starts_at) <= now &&
      (!row.ends_at || new Date(row.ends_at) > now),
    email: row.email,
    endsAt: row.ends_at,
    fullName: row.full_name,
    id: row.id,
    portalUserId: row.portal_user_id,
    startsAt: row.starts_at,
    universityId: row.university_id,
    universityName: row.university_name,
  };
}
