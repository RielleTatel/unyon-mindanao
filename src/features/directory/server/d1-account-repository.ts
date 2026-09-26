import "server-only";

import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { AccountRepository } from "./account-administration";

export class D1AccountRepository implements AccountRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list() {
    return this.transaction.all<{
      id: string;
      full_name: string;
      email: string;
      status: "ACTIVE" | "DISABLED";
    }>(
      `SELECT id, full_name, email, status
       FROM portal_users ORDER BY full_name ASC, id ASC`,
    ).then((rows) => rows.map(({ id, full_name, email, status }) => ({
      id,
      fullName: full_name,
      email,
      status,
    })));
  }

  get(id: string) {
    return this.transaction.first<{
      id: string;
      status: "ACTIVE" | "DISABLED";
    }>("SELECT id, status FROM portal_users WHERE id = ?", id);
  }

  async setStatus(id: string, status: "ACTIVE" | "DISABLED", now: Date) {
    this.transaction.enqueueCheckedMutation(
      `UPDATE portal_users SET status = ?, updated_at = ? WHERE id = ?`,
      status,
      now.toISOString(),
      id,
    );
    this.transaction.enqueue(
      `UPDATE portal_sessions SET revoked_at = ?
       WHERE portal_user_id = ? AND revoked_at IS NULL`,
      now.toISOString(),
      id,
    );
  }

  async appointments() {
    const rows = await this.transaction.all<{
      id: string;
      portal_user_id: string;
      starts_at: string;
      ends_at: string | null;
      full_name: string;
      university_name: string | null;
    }>(
      `SELECT a.id, a.portal_user_id, a.starts_at, a.ends_at,
              u.full_name, m.name AS university_name
       FROM appointments AS a
       JOIN portal_users AS u ON u.id = a.portal_user_id
       LEFT JOIN member_universities AS m ON m.id = a.university_id
       WHERE a.role = 'UNIVERSITY_ADMIN'
       ORDER BY a.starts_at DESC, a.id ASC`,
    );
    return rows.map((row) => ({
      endsAt: row.ends_at,
      id: row.id,
      portalUser: { fullName: row.full_name },
      portalUserId: row.portal_user_id,
      startsAt: row.starts_at,
      university: { name: row.university_name ?? "" },
    }));
  }

  async appointment(id: string) {
    const row = await this.transaction.first<{
      id: string;
      portal_user_id: string;
      starts_at: string;
      ends_at: string | null;
    }>(
      `SELECT id, portal_user_id, starts_at, ends_at
       FROM appointments WHERE id = ? AND role = 'UNIVERSITY_ADMIN'`,
      id,
    );
    return row
      ? {
          endsAt: row.ends_at ? new Date(row.ends_at) : null,
          id: row.id,
          portalUserId: row.portal_user_id,
          startsAt: new Date(row.starts_at),
        }
      : null;
  }

  async endAppointment(id: string, userId: string, now: Date) {
    const nowIso = now.toISOString();
    const remaining = await this.transaction.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointments
       WHERE portal_user_id = ? AND id <> ? AND starts_at <= ?
         AND (ends_at IS NULL OR ends_at > ?)`,
      userId,
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
      userId,
      id,
      nowIso,
      nowIso,
      remainingCount,
    );
    this.transaction.enqueueCheckedMutation(
      `UPDATE appointments SET ends_at = ?
       WHERE id = ? AND portal_user_id = ? AND role = 'UNIVERSITY_ADMIN'
         AND starts_at < ? AND (ends_at IS NULL OR ends_at > ?)`,
      nowIso,
      id,
      userId,
      nowIso,
      nowIso,
    );
    if (remainingCount === 0) {
      this.transaction.enqueue(
        `UPDATE portal_sessions SET revoked_at = ?
         WHERE portal_user_id = ? AND revoked_at IS NULL`,
        nowIso,
        userId,
      );
    }
    return;
  }
}
