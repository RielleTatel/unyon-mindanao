import "server-only";

import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { BirthdayRecord, BirthDateSubject } from "../contracts";
import type { BirthdayRepository } from "./birthdays";

const activeWhere = (now: Date) => ({ startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] });
const subjectSelect = (now: Date) => ({
  id: true, fullName: true, status: true,
  appointments: { where: activeWhere(now), select: { universityId: true } },
}) satisfies Prisma.PortalUserSelect;

export class PrismaBirthdayRepository implements BirthdayRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async list(month: number, now: Date): Promise<BirthdayRecord[]> {
    // The unrestricted query never selects birth_date or birth year.
    const rows = await this.transaction.$queryRaw<Array<{
      id: string; fullName: string; month: number; day: number;
      role: BirthdayRecord["appointments"][number]["role"]; universityId: string | null; universityName: string;
    }>>`
      SELECT u.id, u.full_name AS "fullName", EXTRACT(MONTH FROM u.birth_date)::int AS month,
        EXTRACT(DAY FROM u.birth_date)::int AS day, a.role,
        a.university_id AS "universityId", COALESCE(m.name, 'Confederation') AS "universityName"
      FROM portal_users u JOIN appointments a ON a.portal_user_id = u.id
      LEFT JOIN member_universities m ON m.id = a.university_id
      WHERE u.status = 'ACTIVE' AND EXTRACT(MONTH FROM u.birth_date) = ${month}
        AND a.starts_at <= ${now} AND (a.ends_at IS NULL OR a.ends_at > ${now})
      ORDER BY day, u.full_name, u.id, a.role, a.university_id
    `;
    const people = new Map<string, BirthdayRecord>();
    for (const row of rows) {
      const person = people.get(row.id) ?? { portalUserId: row.id, fullName: row.fullName, month: row.month, day: row.day, appointments: [] };
      person.appointments.push({ role: row.role, universityId: row.universityId, universityName: row.universityName });
      people.set(row.id, person);
    }
    return [...people.values()];
  }

  async subjects(universityIds: string[] | undefined, now: Date) {
    const rows = await this.transaction.portalUser.findMany({
      where: universityIds ? { status: "ACTIVE", appointments: { some: { ...activeWhere(now), universityId: { in: universityIds } } } } : {},
      select: subjectSelect(now), orderBy: [{ fullName: "asc" }, { id: "asc" }],
    });
    return rows.map(toSubject);
  }

  async subject(id: string, now: Date) {
    const row = await this.transaction.portalUser.findUnique({ where: { id }, select: subjectSelect(now) });
    return row ? toSubject(row) : null;
  }

  async read(id: string) {
    const row = await this.transaction.portalUser.findUniqueOrThrow({ where: { id }, select: { id: true, birthDate: true, birthDateVersion: true } });
    return { id: row.id, birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null, version: row.birthDateVersion };
  }

  async update(id: string, birthDate: string | null, version: number) {
    const result = await this.transaction.portalUser.updateMany({
      where: { id, birthDateVersion: version },
      data: { birthDate: birthDate ? new Date(`${birthDate}T00:00:00Z`) : null, birthDateVersion: { increment: 1 } },
    });
    if (result.count !== 1) throw new AccessError("CONFLICT", "Birth date changed. Load it again before saving.");
  }

  async removeExpired(now: Date) {
    const [result] = await this.transaction.$queryRaw<Array<{ count: number }>>`
      WITH removed AS (
        UPDATE portal_users u SET birth_date = NULL, birth_date_version = birth_date_version + 1, updated_at = ${now}
        WHERE birth_date IS NOT NULL
          AND EXISTS (SELECT 1 FROM appointments a WHERE a.portal_user_id = u.id)
          AND NOT EXISTS (
            SELECT 1 FROM appointments a WHERE a.portal_user_id = u.id
              AND (a.ends_at IS NULL OR a.ends_at > ${now}::timestamptz - INTERVAL '1 year')
          )
        RETURNING id
      ) SELECT COUNT(*)::int AS count FROM removed
    `;
    return result.count;
  }
}

function toSubject(row: { id: string; fullName: string; status: "ACTIVE" | "DISABLED"; appointments: Array<{ universityId: string | null }> }): BirthDateSubject {
  return { id: row.id, fullName: row.fullName, status: row.status, activeUniversityIds: [...new Set(row.appointments.flatMap(({ universityId }) => universityId ? [universityId] : []))] };
}
