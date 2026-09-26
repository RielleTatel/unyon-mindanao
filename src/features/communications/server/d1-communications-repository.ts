import "server-only";

import { AccessError } from "@/features/access/server";
import type { AnnouncementRecord, ShortcutRecord } from "../contracts";
import type { CommunicationsRepository } from "./communications";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  status: AnnouncementRecord["status"];
  version: number;
  published_at: string | null;
}

interface ShortcutRow {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  sort_order: number;
  active: number;
  version: number;
}

export class D1CommunicationsRepository implements CommunicationsRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async announcements(administrative: boolean) {
    const rows = await this.transaction.all<AnnouncementRow>(
      `SELECT id, title, body, status, version, published_at
       FROM announcements
       ${administrative ? "" : "WHERE status = 'PUBLISHED'"}
       ORDER BY (published_at IS NULL) DESC, published_at DESC, id ASC`,
    );
    return rows.map(toAnnouncement);
  }

  async announcement(id: string) {
    const row = await this.transaction.first<AnnouncementRow>(
      `SELECT id, title, body, status, version, published_at
       FROM announcements WHERE id = ?`,
      id,
    );
    return row ? toAnnouncement(row) : null;
  }

  async saveAnnouncement(
    input: Parameters<CommunicationsRepository["saveAnnouncement"]>[0],
  ) {
    const now = this.transaction.occurredAt.toISOString();
    if (input.version === undefined) {
      this.transaction.enqueue(
        `INSERT INTO announcements (id, title, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        input.id,
        input.title,
        input.body,
        now,
        now,
      );
      return {
        body: input.body,
        id: input.id,
        publishedAt: null,
        status: "DRAFT" as const,
        title: input.title,
        version: 1,
      };
    }

    const current = await this.announcement(input.id);
    if (!current || current.version !== input.version || current.status === "ARCHIVED") {
      throw new AccessError("CONFLICT", "Announcement changed or is archived");
    }
    this.transaction.enqueueCheckedMutation(
      `UPDATE announcements
       SET title = ?, body = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND status <> 'ARCHIVED'`,
      input.title,
      input.body,
      now,
      input.id,
      input.version,
    );
    return {
      ...current,
      body: input.body,
      title: input.title,
      version: input.version + 1,
    };
  }

  async transition(
    id: string,
    version: number,
    status: AnnouncementRecord["status"],
    now: Date,
  ) {
    const current = await this.announcement(id);
    if (!current || current.version !== version) {
      throw new AccessError("CONFLICT", "Announcement changed");
    }
    const publishedAt = status === "PUBLISHED" ? now.toISOString() : current.publishedAt;
    this.transaction.enqueueCheckedMutation(
      `UPDATE announcements
       SET status = ?,
           published_at = CASE WHEN ? = 'PUBLISHED' THEN ? ELSE published_at END,
           version = version + 1,
           updated_at = ?
       WHERE id = ? AND version = ?`,
      status,
      status,
      now.toISOString(),
      now.toISOString(),
      id,
      version,
    );
    return { ...current, publishedAt, status, version: version + 1 };
  }

  async shortcuts(administrative: boolean) {
    const rows = await this.transaction.all<ShortcutRow>(
      `SELECT id, label, url, icon, sort_order, active, version
       FROM shortcuts
       ${administrative ? "" : "WHERE active = 1"}
       ORDER BY sort_order ASC, id ASC`,
    );
    return rows.map(toShortcut);
  }

  async shortcut(id: string) {
    const row = await this.transaction.first<ShortcutRow>(
      `SELECT id, label, url, icon, sort_order, active, version
       FROM shortcuts WHERE id = ?`,
      id,
    );
    return row ? toShortcut(row) : null;
  }

  async saveShortcut(
    input: Parameters<CommunicationsRepository["saveShortcut"]>[0],
  ) {
    const now = this.transaction.occurredAt.toISOString();
    if (input.version === undefined) {
      const row = await this.transaction.first<{ max_order: number | null }>(
        "SELECT MAX(sort_order) AS max_order FROM shortcuts",
      );
      const previousMax = row?.max_order ?? -1;
      const sortOrder = previousMax + 1;
      this.transaction.enqueueGuard(
        `SELECT MAX(sort_order) FROM shortcuts
         HAVING COALESCE(MAX(sort_order), -1) = ?`,
        previousMax,
      );
      this.transaction.enqueue(
        `INSERT INTO shortcuts
          (id, label, url, icon, sort_order, active, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        input.id,
        input.label,
        input.url,
        input.icon,
        sortOrder,
        input.active ? 1 : 0,
        now,
        now,
      );
      return {
        active: input.active,
        icon: input.icon,
        id: input.id,
        label: input.label,
        sortOrder,
        url: input.url,
        version: 1,
      } satisfies ShortcutRecord;
    }

    const current = await this.shortcut(input.id);
    if (!current || current.version !== input.version) {
      throw new AccessError("CONFLICT", "Shortcut changed");
    }
    this.transaction.enqueueCheckedMutation(
      `UPDATE shortcuts
       SET label = ?, url = ?, icon = ?, active = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
      input.label,
      input.url,
      input.icon,
      input.active ? 1 : 0,
      now,
      input.id,
      input.version,
    );
    return {
      ...current,
      active: input.active,
      icon: input.icon,
      label: input.label,
      url: input.url,
      version: input.version + 1,
    };
  }

  async reorder(ids: string[]) {
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueGuard(
      "SELECT COUNT(*) FROM shortcuts HAVING COUNT(*) = ?",
      ids.length,
    );
    this.transaction.enqueueCheckedMutationWithCount(
      `UPDATE shortcuts
       SET sort_order = CAST(ordered.key AS INTEGER),
           version = version + 1,
           updated_at = ?
       FROM json_each(?) AS ordered
       WHERE shortcuts.id = ordered.value`,
      ids.length,
      now,
      JSON.stringify(ids),
    );
  }
}

function toAnnouncement(row: AnnouncementRow): AnnouncementRecord {
  return {
    body: row.body,
    id: row.id,
    publishedAt: row.published_at,
    status: row.status,
    title: row.title,
    version: row.version,
  };
}

function toShortcut(row: ShortcutRow): ShortcutRecord {
  return {
    active: row.active === 1,
    icon: row.icon,
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    url: row.url,
    version: row.version,
  };
}
