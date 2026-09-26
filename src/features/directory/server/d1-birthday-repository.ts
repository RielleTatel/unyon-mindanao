import "server-only";

import { AccessError } from "@/features/access/server";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { BirthdayRecord, BirthDateSubject, RestrictedBirthDate } from "../contracts";
import type { BirthdayRepository } from "./birthdays";

interface BirthdayRow {
  id: string;
  full_name: string;
  month: number;
  day: number;
  role: BirthdayRecord["appointments"][number]["role"];
  university_id: string | null;
  university_name: string;
}

interface SubjectRow {
  id: string;
  full_name: string;
  status: BirthDateSubject["status"];
  university_id: string | null;
}

export class D1BirthdayRepository implements BirthdayRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list(month: number, now: Date): Promise<BirthdayRecord[]> {
    const rows = await this.transaction.all<BirthdayRow>(
      `SELECT u.id, u.full_name,
              CAST(substr(u.birth_date, 6, 2) AS INTEGER) AS month,
              CAST(substr(u.birth_date, 9, 2) AS INTEGER) AS day,
              a.role, a.university_id,
              COALESCE(m.name, 'Confederation') AS university_name
       FROM portal_users AS u
       JOIN appointments AS a
         ON a.portal_user_id = u.id
        AND a.starts_at <= ?
        AND (a.ends_at IS NULL OR a.ends_at > ?)
       LEFT JOIN member_universities AS m ON m.id = a.university_id
       WHERE u.status = 'ACTIVE'
         AND u.birth_date IS NOT NULL
         AND CAST(substr(u.birth_date, 6, 2) AS INTEGER) = ?
       ORDER BY day, u.full_name, u.id, a.role, a.university_id`,
      now.toISOString(),
      now.toISOString(),
      month,
    );
    const people = new Map<string, BirthdayRecord>();
    for (const row of rows) {
      const person = people.get(row.id) ?? {
        appointments: [],
        day: row.day,
        fullName: row.full_name,
        month: row.month,
        portalUserId: row.id,
      };
      person.appointments.push({
        role: row.role,
        universityId: row.university_id,
        universityName: row.university_name,
      });
      people.set(row.id, person);
    }
    return [...people.values()];
  }

  async subjects(universityIds: string[] | undefined, now: Date) {
    const rows = await this.subjectRows(undefined, universityIds, now);
    return groupSubjects(rows);
  }

  async subject(id: string, now: Date) {
    const rows = await this.subjectRows(id, undefined, now);
    return groupSubjects(rows)[0] ?? null;
  }

  async read(id: string): Promise<RestrictedBirthDate> {
    const row = await this.transaction.first<{
      id: string;
      birth_date: string | null;
      birth_date_version: number;
    }>(
      `SELECT id, birth_date, birth_date_version
       FROM portal_users WHERE id = ?`,
      id,
    );
    if (!row) throw new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden");
    return {
      birthDate: row.birth_date,
      id: row.id,
      version: row.birth_date_version,
    };
  }

  async update(id: string, birthDate: string | null, version: number) {
    this.transaction.enqueueCheckedMutation(
      `UPDATE portal_users
       SET birth_date = ?, birth_date_version = birth_date_version + 1, updated_at = ?
       WHERE id = ? AND birth_date_version = ?`,
      birthDate,
      this.transaction.occurredAt.toISOString(),
      id,
      version,
    );
  }

  async removeExpired(now: Date) {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    const cutoffIso = cutoff.toISOString();
    const expiredUsers = await this.transaction.all<{
      id: string;
      birth_date_version: number;
    }>(
      `SELECT u.id, u.birth_date_version FROM portal_users AS u
       WHERE u.birth_date IS NOT NULL
         AND EXISTS (SELECT 1 FROM appointments AS any_appointment WHERE any_appointment.portal_user_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM appointments AS recent_appointment
           WHERE recent_appointment.portal_user_id = u.id
             AND (recent_appointment.ends_at IS NULL OR recent_appointment.ends_at > ?)
         )`,
      cutoffIso,
    );
    const expiredCount = expiredUsers.length;
    const snapshot = JSON.stringify(
      expiredUsers.map(({ id, birth_date_version }) => ({
        id,
        version: birth_date_version,
      })),
    );
    this.transaction.enqueueCheckedMutationWithCount(
      `UPDATE portal_users
       SET birth_date = NULL, birth_date_version = birth_date_version + 1, updated_at = ?
       FROM json_each(?) AS expired
       WHERE portal_users.id = json_extract(expired.value, '$.id')
         AND portal_users.birth_date_version = CAST(json_extract(expired.value, '$.version') AS INTEGER)
         AND birth_date IS NOT NULL
         AND EXISTS (SELECT 1 FROM appointments AS any_appointment WHERE any_appointment.portal_user_id = portal_users.id)
         AND NOT EXISTS (
           SELECT 1 FROM appointments AS recent_appointment
           WHERE recent_appointment.portal_user_id = portal_users.id
             AND (recent_appointment.ends_at IS NULL OR recent_appointment.ends_at > ?)
      )`,
      expiredCount,
      now.toISOString(),
      snapshot,
      cutoffIso,
    );
    return expiredCount;
  }

  private async subjectRows(
    id: string | undefined,
    universityIds: string[] | undefined,
    now: Date,
  ) {
    const values: unknown[] = [now.toISOString(), now.toISOString()];
    const where: string[] = [];
    if (id) {
      where.push("u.id = ?");
      values.push(id);
    }
    if (universityIds) {
      if (universityIds.length === 0) return [];
      where.push(
        `u.status = 'ACTIVE' AND EXISTS (
           SELECT 1 FROM appointments AS scoped
           WHERE scoped.portal_user_id = u.id
             AND scoped.university_id IN (${universityIds.map(() => "?").join(", ")})
             AND scoped.starts_at <= ?
             AND (scoped.ends_at IS NULL OR scoped.ends_at > ?)
         )`,
      );
      values.push(...universityIds, now.toISOString(), now.toISOString());
    }
    return this.transaction.all<SubjectRow>(
      `SELECT u.id, u.full_name, u.status, a.university_id
       FROM portal_users AS u
       LEFT JOIN appointments AS a
         ON a.portal_user_id = u.id
        AND a.starts_at <= ?
        AND (a.ends_at IS NULL OR a.ends_at > ?)
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY u.full_name, u.id, a.university_id`,
      ...values,
    );
  }
}

function groupSubjects(rows: SubjectRow[]): BirthDateSubject[] {
  const subjects = new Map<string, BirthDateSubject>();
  for (const row of rows) {
    const subject = subjects.get(row.id) ?? {
      activeUniversityIds: [],
      fullName: row.full_name,
      id: row.id,
      status: row.status,
    };
    if (row.university_id && !subject.activeUniversityIds.includes(row.university_id)) {
      subject.activeUniversityIds.push(row.university_id);
    }
    subjects.set(row.id, subject);
  }
  return [...subjects.values()];
}
