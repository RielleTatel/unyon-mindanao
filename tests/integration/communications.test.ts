import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, type PortalRole } from "@/features/access/server";
import { createCommunicationsFeature } from "@/features/communications/server";
import { PrismaCommunicationsRepository } from "@/features/communications/server/prisma-communications-repository";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("A dedicated test database is required");
const prisma = createPrismaClient(url);
afterAll(() => prisma.$disconnect());
const call = (input: unknown) => ({ input, sessionToken: "session", correlationId: randomUUID() });

async function actor(role: PortalRole) {
  const university = role === "SUPER_ADMIN" ? null : await prisma.memberUniversity.create({ data: { name: randomUUID(), slug: randomUUID() } });
  const user = await prisma.portalUser.create({ data: { firebaseUid: randomUUID(), email: `${randomUUID()}@unyon.test`, fullName: "Communications Actor" } });
  await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId: university?.id, startsAt: new Date(Date.now() - 1000) } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
  const { transactions } = createAccessPersistence(prisma, (transaction) => ({ communications: new PrismaCommunicationsRepository(transaction) }));
  return createCommunicationsFeature({ transactions, sessions: { hashSessionToken: async () => tokenHash } });
}

describe("Confederation communications", () => {
  it("hides drafts, publishes, rejects stale writes, archives and restores with audit evidence", async () => {
    const admin = await actor("SUPER_ADMIN");
    const rep = await actor("REPRESENTATIVE");
    let record = await admin.saveAnnouncement(call({ title: "Confederation Update", body: "A private draft." }));
    expect((await rep.listAnnouncements(call({}))).some(({ id }) => id === record.id)).toBe(false);
    record = await admin.transitionAnnouncement(call({ id: record.id, version: record.version, status: "PUBLISHED" }));
    expect(await rep.listAnnouncements(call({}))).toContainEqual(record);
    await expect(admin.saveAnnouncement(call({ id: record.id, version: 1, title: "Stale", body: "Stale" }))).rejects.toMatchObject({ code: "CONFLICT" });
    record = await admin.saveAnnouncement(call({ id: record.id, version: record.version, title: "Edited update", body: "Updated publication" }));
    record = await admin.transitionAnnouncement(call({ id: record.id, version: record.version, status: "ARCHIVED" }));
    expect((await rep.listAnnouncements(call({}))).some(({ id }) => id === record.id)).toBe(false);
    await expect(admin.transitionAnnouncement(call({ id: record.id, version: record.version, status: "PUBLISHED" }))).rejects.toMatchObject({ code: "CONFLICT" });
    await admin.transitionAnnouncement(call({ id: record.id, version: record.version, status: "DRAFT" }));
    expect(await prisma.auditLog.count({ where: { resourceId: record.id } })).toBe(5);
  });

  it.each(["UNIVERSITY_ADMIN", "REPRESENTATIVE"] as const)("denies %s all content mutations", async (role) => {
    const feature = await actor(role);
    await expect(feature.saveAnnouncement(call({ title: "Forbidden", body: "Forbidden" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(feature.saveShortcut(call({ label: "Forbidden", url: "https://example.org", icon: null, active: true }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(feature.reorderShortcuts(call({ ids: [] }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });

  it("orders links, hides inactive links, validates URLs, and rejects incomplete reorder lists", async () => {
    const admin = await actor("SUPER_ADMIN");
    const rep = await actor("REPRESENTATIVE");
    const first = await admin.saveShortcut(call({ label: "First", url: "https://example.org/a", icon: "↗", active: true }));
    const second = await admin.saveShortcut(call({ label: "Second", url: "https://example.org/b", icon: null, active: true }));
    const all = await admin.listShortcuts(call({}));
    await admin.reorderShortcuts(call({ ids: [second.id, first.id, ...all.filter(({ id }) => id !== first.id && id !== second.id).map(({ id }) => id)] }));
    expect((await rep.listShortcuts(call({}))).slice(0, 2).map(({ id }) => id)).toEqual([second.id, first.id]);
    const reordered = (await admin.listShortcuts(call({}))).find(({ id }) => id === first.id)!;
    await admin.saveShortcut(call({ ...reordered, active: false }));
    expect((await rep.listShortcuts(call({}))).some(({ id }) => id === first.id)).toBe(false);
    for (const invalid of ["javascript:alert(1)", "https://user:password@example.org", "data:text/html,test"]) {
      await expect(admin.saveShortcut(call({ label: "Unsafe", url: invalid, icon: null, active: true }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(admin.reorderShortcuts(call({ ids: [second.id] }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(Object.keys((await rep.listShortcuts(call({})))[0]).sort()).toEqual(["active", "icon", "id", "label", "sortOrder", "url", "version"]);
  });
});
