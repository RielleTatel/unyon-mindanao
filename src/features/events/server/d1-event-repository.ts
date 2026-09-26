import "server-only";

import { AccessError } from "@/features/access/server";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { EventLifecycleStatus, EventRecord } from "../contracts";
import type { EventRepository } from "./events";

interface EventRow {
  id: string;
  title: string;
  description: string;
  category: string;
  status: EventLifecycleStatus;
  starts_at: string;
  ends_at: string;
  all_day: number;
  location: string | null;
  online_url: string | null;
  contact_person: string | null;
  owner_university_id: string | null;
  owner_university_name: string | null;
  cover_object_id: string | null;
  version: number;
  published_at: string | null;
  co_host_id: string | null;
  co_host_name: string | null;
}

const eventSelection = `
  SELECT e.id, e.title, e.description, e.category, e.status,
         e.starts_at, e.ends_at, e.all_day, e.location, e.online_url,
         e.contact_person, e.owner_university_id,
         owner.name AS owner_university_name,
         e.cover_object_id, e.version, e.published_at,
         co.id AS co_host_id, co.name AS co_host_name
  FROM events AS e
  LEFT JOIN member_universities AS owner ON owner.id = e.owner_university_id
  LEFT JOIN event_co_hosts AS host ON host.event_id = e.id
  LEFT JOIN member_universities AS co ON co.id = host.university_id`;

export class D1EventRepository implements EventRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list(input: {
    actorRoles: Array<{ role: string; universityId: string | null }>;
    includeArchived: boolean;
    upcomingOnly: boolean;
    asOf: Date;
    search: string;
  }) {
    const isSuperAdmin = input.actorRoles.some(({ role }) => role === "SUPER_ADMIN");
    const managedUniversityIds = input.actorRoles.flatMap(({ role, universityId }) =>
      role === "UNIVERSITY_ADMIN" && universityId ? [universityId] : [],
    );
    const where: string[] = [];
    const values: unknown[] = [];

    if (!isSuperAdmin) {
      if (managedUniversityIds.length) {
        where.push(
          `(e.status = 'PUBLISHED' OR e.owner_university_id IN (${managedUniversityIds.map(() => "?").join(", ")}))`,
        );
        values.push(...managedUniversityIds);
      } else {
        where.push("e.status = 'PUBLISHED'");
      }
    }
    if (!input.includeArchived) where.push("e.status <> 'ARCHIVED'");
    if (input.upcomingOnly) {
      where.push("e.ends_at >= ?");
      values.push(input.asOf.toISOString());
    }
    if (input.search) {
      where.push(
        `(instr(lower(e.title), lower(?)) > 0 OR
          instr(lower(e.description), lower(?)) > 0 OR
          instr(lower(e.category), lower(?)) > 0 OR
          instr(lower(COALESCE(e.location, '')), lower(?)) > 0)`,
      );
      values.push(input.search, input.search, input.search, input.search);
    }

    const rows = await this.transaction.all<EventRow>(
      `${eventSelection}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY e.starts_at ASC, e.title ASC, co.name ASC`,
      ...values,
    );
    return groupEventRows(rows).map(({ row, coHosts }) => toEventRecord(row, coHosts));
  }

  async get(id: string) {
    const rows = await this.transaction.all<EventRow>(
      `${eventSelection} WHERE e.id = ? ORDER BY co.name ASC`,
      id,
    );
    if (!rows.length) return null;
    const [{ row, coHosts }] = groupEventRows(rows);
    return {
      record: toEventRecord(row, coHosts),
      subject: {
        endsAt: new Date(row.ends_at),
        id: row.id,
        kind: "Event" as const,
        ownerUniversityId: row.owner_university_id,
        startsAt: new Date(row.starts_at),
        status: row.status,
      },
    };
  }

  async activeUniversity(id: string) {
    return this.transaction.first<{ id: string; name: string }>(
      `SELECT id, name FROM member_universities
       WHERE id = ? AND status = 'ACTIVE'`,
      id,
    );
  }

  async listActiveUniversities() {
    return this.transaction.all<{ id: string; name: string }>(
      `SELECT id, name FROM member_universities
       WHERE status = 'ACTIVE' ORDER BY name ASC`,
    );
  }

  async createDraft(input: Parameters<EventRepository["createDraft"]>[0]) {
    const universityIds = [
      ...(input.ownerUniversityId ? [input.ownerUniversityId] : []),
      ...input.coHostUniversityIds,
    ];
    const universities = universityIds.length
      ? await this.transaction.all<{ id: string; name: string }>(
          `SELECT id, name FROM member_universities
           WHERE status = 'ACTIVE' AND id IN (${universityIds.map(() => "?").join(", ")})`,
          ...universityIds,
        )
      : [];
    if (universities.length !== universityIds.length) {
      throw new AccessError("INVALID_INPUT", "Choose active Member Universities as the owner and co-hosts");
    }
    if (universityIds.length) {
      this.transaction.enqueueGuard(
        `SELECT COUNT(*) FROM member_universities
         WHERE status = 'ACTIVE' AND id IN (${universityIds.map(() => "?").join(", ")})
         HAVING COUNT(*) = ?`,
        ...universityIds,
        universityIds.length,
      );
    }

    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueue(
      `INSERT INTO events
        (id, title, description, category, starts_at, ends_at, all_day,
         location, online_url, contact_person, owner_university_id,
         created_by_portal_user_id, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      input.id,
      input.title,
      input.description,
      input.category,
      input.startsAt.toISOString(),
      input.endsAt.toISOString(),
      input.allDay ? 1 : 0,
      input.location,
      input.onlineUrl,
      input.contactPerson,
      input.ownerUniversityId,
      input.createdByPortalUserId,
      now,
      now,
    );
    for (const universityId of input.coHostUniversityIds) {
      this.transaction.enqueue(
        `INSERT INTO event_co_hosts (event_id, university_id, created_at)
         VALUES (?, ?, ?)`,
        input.id,
        universityId,
        now,
      );
    }

    const byId = new Map(universities.map(({ id, name }) => [id, name]));
    return {
      allDay: input.allDay,
      canComplete: false,
      category: input.category,
      coHosts: input.coHostUniversityIds.map((id) => ({ id, name: byId.get(id)! })),
      contactPerson: input.contactPerson,
      coverObjectId: null,
      description: input.description,
      endsAt: input.endsAt.toISOString(),
      id: input.id,
      location: input.location,
      manageable: false,
      onlineUrl: input.onlineUrl,
      ownerUniversityId: input.ownerUniversityId,
      ownerUniversityName: input.ownerUniversityId
        ? byId.get(input.ownerUniversityId)!
        : "Unyon Mindanao",
      publishedAt: null,
      startsAt: input.startsAt.toISOString(),
      status: "DRAFT" as const,
      title: input.title,
      version: 1,
    } satisfies EventRecord;
  }

  async transition(input: Parameters<EventRepository["transition"]>[0]) {
    const current = await this.get(input.id);
    if (
      !current ||
      current.subject.status !== input.from ||
      current.record.version !== input.expectedVersion
    ) {
      return null;
    }

    const now = input.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE events
       SET status = ?,
           published_at = CASE WHEN ? = 'PUBLISHED' THEN ? ELSE published_at END,
           cancelled_at = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancelled_at END,
           completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END,
           archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END,
           version = version + 1,
           updated_at = ?
       WHERE id = ? AND status = ? AND version = ?`,
      input.to,
      input.to,
      now,
      input.to,
      now,
      input.to,
      now,
      input.to,
      now,
      now,
      input.id,
      input.from,
      input.expectedVersion,
    );
    return {
      ...current.record,
      publishedAt: input.to === "PUBLISHED" ? now : current.record.publishedAt,
      status: input.to,
      version: input.expectedVersion + 1,
    };
  }

  async editDetails(input: Parameters<EventRepository["editDetails"]>[0]) {
    const current = await this.get(input.id);
    if (
      !current ||
      current.record.version !== input.version ||
      !["DRAFT", "PUBLISHED"].includes(current.record.status)
    ) {
      return null;
    }
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE events
       SET title = ?, description = ?, location = ?, online_url = ?,
           contact_person = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status IN ('DRAFT', 'PUBLISHED')`,
      input.title,
      input.description,
      input.location,
      input.onlineUrl,
      input.contactPerson,
      now,
      input.id,
      input.version,
    );
    return {
      ...current.record,
      contactPerson: input.contactPerson,
      description: input.description,
      location: input.location,
      onlineUrl: input.onlineUrl,
      title: input.title,
      version: input.version + 1,
    };
  }
}

function groupEventRows(rows: EventRow[]) {
  const records = new Map<string, { row: EventRow; coHosts: Array<{ id: string; name: string }> }>();
  for (const row of rows) {
    const item = records.get(row.id) ?? { row, coHosts: [] };
    if (row.co_host_id && row.co_host_name) {
      item.coHosts.push({ id: row.co_host_id, name: row.co_host_name });
    }
    records.set(row.id, item);
  }
  return [...records.values()];
}

function toEventRecord(
  row: EventRow,
  coHosts: Array<{ id: string; name: string }>,
): EventRecord {
  return {
    allDay: row.all_day === 1,
    canComplete: false,
    category: row.category,
    coHosts,
    contactPerson: row.contact_person,
    coverObjectId: row.cover_object_id,
    description: row.description,
    endsAt: row.ends_at,
    id: row.id,
    location: row.location,
    manageable: false,
    onlineUrl: row.online_url,
    ownerUniversityId: row.owner_university_id,
    ownerUniversityName: row.owner_university_name ?? "Unyon Mindanao",
    publishedAt: row.published_at,
    startsAt: row.starts_at,
    status: row.status,
    title: row.title,
    version: row.version,
  };
}
