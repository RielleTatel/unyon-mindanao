import "server-only";

import type {
  MemberUniversityRecord,
  MemberUniversityRepository,
} from "./member-universities";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";

interface MemberUniversityRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: MemberUniversityRecord["status"];
  created_at: string;
  updated_at: string;
}

export class D1MemberUniversityRepository implements MemberUniversityRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list(includeArchived: boolean) {
    const rows = await this.transaction.all<MemberUniversityRow>(
      `SELECT id, name, slug, description, status, created_at, updated_at
       FROM member_universities
       ${includeArchived ? "" : "WHERE status = 'ACTIVE'"}
       ORDER BY status ASC, name ASC`,
    );
    return rows.map(toRecord);
  }

  async get(id: string) {
    const row = await this.transaction.first<MemberUniversityRow>(
      `SELECT id, name, slug, description, status, created_at, updated_at
       FROM member_universities WHERE id = ?`,
      id,
    );
    return row ? toRecord(row) : null;
  }

  async create(input: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }) {
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueue(
      `INSERT INTO member_universities
        (id, name, slug, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.id,
      input.name,
      input.slug,
      input.description,
      now,
      now,
    );
    return {
      ...input,
      createdAt: now,
      status: "ACTIVE" as const,
      updatedAt: now,
    };
  }

  async updateActive(
    id: string,
    input: { name: string; slug: string; description: string | null },
  ) {
    const current = await this.get(id);
    if (!current || current.status !== "ACTIVE") return null;
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE member_universities
       SET name = ?, slug = ?, description = ?, updated_at = ?
       WHERE id = ? AND status = 'ACTIVE'`,
      input.name,
      input.slug,
      input.description,
      now,
      id,
    );
    return { ...current, ...input, updatedAt: now };
  }

  async archive(id: string) {
    return this.transition(id, "ACTIVE", "ARCHIVED");
  }

  async restore(id: string) {
    return this.transition(id, "ARCHIVED", "ACTIVE");
  }

  private async transition(
    id: string,
    from: MemberUniversityRecord["status"],
    to: MemberUniversityRecord["status"],
  ) {
    const current = await this.get(id);
    if (!current || current.status !== from) return null;
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE member_universities SET status = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
      to,
      now,
      id,
      from,
    );
    return { ...current, status: to, updatedAt: now };
  }
}

function toRecord(row: MemberUniversityRow): MemberUniversityRecord {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updated_at,
  };
}
