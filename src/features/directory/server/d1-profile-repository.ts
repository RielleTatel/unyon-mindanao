import "server-only";

import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { ProfileRecord, ProfileRepository } from "./profile";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  status: ProfileRecord["status"];
  profile_object_id: string | null;
  birth_month: number | null;
  birth_day: number | null;
  appointment_id: string | null;
  role: ProfileRecord["appointments"][number]["role"] | null;
  starts_at: string | null;
  ends_at: string | null;
  university_name: string | null;
}

export class D1ProfileRepository implements ProfileRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async get(id: string): Promise<ProfileRecord> {
    const rows = await this.transaction.all<ProfileRow>(
      `SELECT u.id, u.full_name, u.email, u.status, u.profile_object_id,
              CAST(substr(u.birth_date, 6, 2) AS INTEGER) AS birth_month,
              CAST(substr(u.birth_date, 9, 2) AS INTEGER) AS birth_day,
              a.id AS appointment_id, a.role, a.starts_at, a.ends_at,
              m.name AS university_name
       FROM portal_users AS u
       LEFT JOIN appointments AS a ON a.portal_user_id = u.id
       LEFT JOIN member_universities AS m ON m.id = a.university_id
       WHERE u.id = ?
       ORDER BY a.starts_at DESC, a.id ASC`,
      id,
    );
    const first = rows[0];
    if (!first) throw new Error("Profile not found");
    return {
      appointments: rows.flatMap((row) =>
        row.appointment_id && row.role && row.starts_at
          ? [{
              endsAt: row.ends_at,
              id: row.appointment_id,
              role: row.role,
              startsAt: row.starts_at,
              university: row.university_name ? { name: row.university_name } : null,
            }]
          : [],
      ),
      birthday: { day: first.birth_day, month: first.birth_month },
      email: first.email,
      fullName: first.full_name,
      id: first.id,
      profileObjectId: first.profile_object_id,
      status: first.status,
    };
  }
}
