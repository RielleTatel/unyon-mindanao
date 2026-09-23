import "server-only";

import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { CommunicationsRepository } from "./communications";

const announcementSelect = { id: true, title: true, body: true, status: true, version: true, publishedAt: true } satisfies Prisma.AnnouncementSelect;
const shortcutSelect = { id: true, label: true, url: true, icon: true, sortOrder: true, active: true, version: true } satisfies Prisma.ShortcutSelect;
const toAnnouncement = (row: Prisma.AnnouncementGetPayload<{ select: typeof announcementSelect }>) => ({ ...row, publishedAt: row.publishedAt?.toISOString() ?? null });

export class PrismaCommunicationsRepository implements CommunicationsRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async announcements(administrative: boolean) {
    return (await this.transaction.announcement.findMany({ where: administrative ? {} : { status: "PUBLISHED" }, select: announcementSelect, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] })).map(toAnnouncement);
  }
  async announcement(id: string) {
    const row = await this.transaction.announcement.findUnique({ where: { id }, select: announcementSelect });
    return row ? toAnnouncement(row) : null;
  }
  async saveAnnouncement(input: Parameters<CommunicationsRepository["saveAnnouncement"]>[0]) {
    if (input.version === undefined) return toAnnouncement(await this.transaction.announcement.create({ data: { id: input.id, title: input.title, body: input.body }, select: announcementSelect }));
    const changed = await this.transaction.announcement.updateMany({ where: { id: input.id, version: input.version, status: { not: "ARCHIVED" } }, data: { title: input.title, body: input.body, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Announcement changed or is archived");
    return (await this.announcement(input.id))!;
  }
  async transition(id: string, version: number, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", now: Date) {
    const changed = await this.transaction.announcement.updateMany({ where: { id, version }, data: { status, ...(status === "PUBLISHED" ? { publishedAt: now } : {}), version: { increment: 1 } } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Announcement changed");
    return (await this.announcement(id))!;
  }
  async shortcuts(administrative: boolean) {
    return this.transaction.shortcut.findMany({ where: administrative ? {} : { active: true }, select: shortcutSelect, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  }
  async shortcut(id: string) { return this.transaction.shortcut.findUnique({ where: { id }, select: shortcutSelect }); }
  async saveShortcut(input: Parameters<CommunicationsRepository["saveShortcut"]>[0]) {
    const { id, version, ...data } = input;
    if (version === undefined) {
      const last = await this.transaction.shortcut.aggregate({ _max: { sortOrder: true } });
      return this.transaction.shortcut.create({ data: { ...data, id, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: shortcutSelect });
    }
    const changed = await this.transaction.shortcut.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Shortcut changed");
    return (await this.shortcut(id))!;
  }
  async reorder(ids: string[]) {
    for (const [sortOrder, id] of ids.entries()) await this.transaction.shortcut.update({ where: { id }, data: { sortOrder, version: { increment: 1 } } });
  }
}
