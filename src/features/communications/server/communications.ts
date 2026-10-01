import "server-only";

import { z } from "zod";
import { collectionPage, paginationInput, type PageSelection } from "@/shared/pagination";
import { AccessError, createProtectedOperationFactory, type PortalActor, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { AnnouncementRecord, ShortcutRecord } from "../contracts";

const revision = { id: z.string().uuid(), version: z.number().int().positive() };
const draft = z.object({ id: z.string().uuid().optional(), version: z.number().int().positive().optional(), title: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(10000) }).refine((input) => !input.id || input.version !== undefined);
const shortcut = z.object({
  id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(120), icon: z.string().trim().max(48).nullable(), active: z.boolean(),
  url: z.url().max(2000).refine((value) => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }),
}).refine((input) => !input.id || input.version !== undefined);

export interface CommunicationsRepository {
  recentAnnouncements(): Promise<{ id: string; title: string; excerpt: string }[]>;
  announcements(administrative: boolean, selection?: PageSelection): Promise<AnnouncementRecord[]>;
  announcement(id: string): Promise<AnnouncementRecord | null>;
  saveAnnouncement(input: z.infer<typeof draft> & { id: string }): Promise<AnnouncementRecord>;
  transition(id: string, version: number, status: AnnouncementRecord["status"], now: Date): Promise<AnnouncementRecord>;
  shortcuts(administrative: boolean): Promise<ShortcutRecord[]>;
  shortcut(id: string): Promise<ShortcutRecord | null>;
  saveShortcut(input: z.infer<typeof shortcut> & { id: string }): Promise<ShortcutRecord>;
  reorder(ids: string[], expected: ShortcutRecord[]): Promise<void>;
}

export function createCommunicationsFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ communications: CommunicationsRepository }> }) {
  const factory = createProtectedOperationFactory(dependencies);
  return {
    recentAnnouncements: factory.query({
      intent: "announcement.recent", input: z.object({}), resolveSubject: async () => ({ id: "recent-announcements", kind: "AnnouncementDirectory" }), authorize: () => true,
      execute: ({ transaction }) => transaction.capabilities.communications.recentAnnouncements(),
    }),
    listAnnouncements: factory.query({
      intent: "announcement.list", input: z.object({}), resolveSubject: async () => ({ id: "announcements", kind: "AnnouncementDirectory" }), authorize: () => true,
      execute: ({ actor, transaction }) => transaction.capabilities.communications.announcements(isSuperAdmin(actor)),
    }),
    announcementPage: factory.query({
      intent: "announcement.page", input: paginationInput, resolveSubject: async () => ({ id: "announcements", kind: "AnnouncementDirectory" }), authorize: () => true,
      execute: async ({ actor, transaction }, input) => ({
        ...collectionPage(await transaction.capabilities.communications.announcements(isSuperAdmin(actor), { limit: input.pageSize + 1, offset: input.page * input.pageSize }), input),
        canManage: isSuperAdmin(actor),
      }),
    }),
    listShortcuts: factory.query({
      intent: "shortcut.list", input: z.object({}), resolveSubject: async () => ({ id: "shortcuts", kind: "ShortcutDirectory" }), authorize: () => true,
      execute: ({ actor, transaction }) => transaction.capabilities.communications.shortcuts(isSuperAdmin(actor)),
    }),
    shortcutWorkspace: factory.query({
      intent: "shortcut.workspace", input: z.object({}), resolveSubject: async () => ({ id: "shortcuts", kind: "ShortcutDirectory" }), authorize: () => true,
      execute: async ({ actor, transaction }) => ({
        records: await transaction.capabilities.communications.shortcuts(isSuperAdmin(actor)),
        canManage: isSuperAdmin(actor),
      }),
    }),
    saveAnnouncement: factory.mutation({
      intent: "announcement.save", action: "announcement.saved", input: draft,
      resolveSubject: async ({ transaction }, input) => {
        if (input.id && !(await transaction.capabilities.communications.announcement(input.id))) return null;
        return { id: input.id ?? crypto.randomUUID(), kind: "Announcement" };
      },
      authorize: ({ actor }) => isSuperAdmin(actor),
      execute: ({ transaction, subject }, input) => transaction.capabilities.communications.saveAnnouncement({ ...input, id: subject.id }),
    }),
    transitionAnnouncement: factory.mutation({
      intent: "announcement.transition", action: "announcement.transitioned", input: z.object({ ...revision, status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }),
      resolveSubject: async ({ transaction }, input) => {
        const record = await transaction.capabilities.communications.announcement(input.id);
        return record ? { ...record, kind: "Announcement" } : null;
      },
      authorize: ({ actor }) => isSuperAdmin(actor),
      execute: ({ transaction, subject, occurredAt }, input) => {
        if (subject.status === input.status || (subject.status === "ARCHIVED" && input.status !== "DRAFT")) throw new AccessError("CONFLICT", "Restore an archived Announcement to draft before publishing");
        return transaction.capabilities.communications.transition(subject.id, input.version, input.status, occurredAt);
      },
      auditMetadata: (_result, input) => ({ status: input.status }),
    }),
    saveShortcut: factory.mutation({
      intent: "shortcut.save", action: "shortcut.saved", input: shortcut,
      resolveSubject: async ({ transaction }, input) => {
        if (input.id && !(await transaction.capabilities.communications.shortcut(input.id))) return null;
        return { id: input.id ?? crypto.randomUUID(), kind: "Shortcut" };
      },
      authorize: ({ actor }) => isSuperAdmin(actor),
      execute: ({ transaction, subject }, input) => transaction.capabilities.communications.saveShortcut({ ...input, id: subject.id }),
      auditMetadata: (result) => ({ active: result.active }),
    }),
    reorderShortcuts: factory.mutation({
      intent: "shortcut.reorder", action: "shortcuts.reordered", input: z.object({ ids: z.array(z.string().uuid()).max(1000).refine((ids) => new Set(ids).size === ids.length) }),
      resolveSubject: async () => ({ id: "shortcuts", kind: "ShortcutDirectory" }), authorize: ({ actor }) => isSuperAdmin(actor),
      execute: async ({ transaction }, input) => {
        const records = await transaction.capabilities.communications.shortcuts(true);
        if (records.length !== input.ids.length || records.some(({ id }) => !input.ids.includes(id))) throw new AccessError("CONFLICT", "Shortcut list changed. Refresh and reorder again.");
        await transaction.capabilities.communications.reorder(input.ids, records);
        return { reordered: true };
      },
    }),
    moveShortcut: factory.mutation({
      intent: "shortcut.move", action: "shortcuts.reordered",
      input: z.object({ ...revision, direction: z.enum(["up", "down"]) }),
      resolveSubject: async () => ({ id: "shortcuts", kind: "ShortcutDirectory" }),
      authorize: ({ actor }) => isSuperAdmin(actor),
      execute: async ({ transaction }, input) => {
        const repository = transaction.capabilities.communications;
        const records = await repository.shortcuts(true);
        const index = records.findIndex(({ id }) => id === input.id);
        const target = index + (input.direction === "up" ? -1 : 1);
        if (index < 0 || records[index].version !== input.version || target < 0 || target >= records.length) {
          throw new AccessError("CONFLICT", "Shortcut list changed. Refresh and reorder again.");
        }
        const ids = records.map(({ id }) => id);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await repository.reorder(ids, records);
        return { reordered: true };
      },
    }),
  };
}

function isSuperAdmin(actor: PortalActor) { return actor.appointments.some(({ role }) => role === "SUPER_ADMIN"); }
