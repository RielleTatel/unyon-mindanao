import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, type PortalRole } from "@/features/access/server";
import { createBirthdayFeature } from "@/features/directory/server";
import { PrismaBirthdayRepository } from "@/features/directory/server/prisma-birthday-repository";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("A dedicated test database is required");
const prisma = createPrismaClient(url);
afterAll(() => prisma.$disconnect());
const request = (input: unknown) => ({ input, sessionToken: "session", correlationId: randomUUID() });
const birthDate = "1997-02-28";

async function university() {
  return prisma.memberUniversity.create({ data: { name: `Birthday ${randomUUID()}`, slug: randomUUID() } });
}
async function officer(role: PortalRole, universityId: string | null) {
  const user = await prisma.portalUser.create({ data: { email: `${randomUUID()}@unyon.test`, firebaseUid: randomUUID(), fullName: `Birthday Officer ${randomUUID()}`, birthDate: new Date(`${birthDate}T00:00:00Z`) } });
  const appointment = await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId, startsAt: new Date(Date.now() - 60_000) } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) } });
  const persistence = createAccessPersistence(prisma, (transaction) => ({ birthdays: new PrismaBirthdayRepository(transaction) }));
  const feature = createBirthdayFeature({ sessions: { hashSessionToken: async () => tokenHash }, transactions: persistence.transactions, identityVerifier: { verifyIdToken: async () => ({ firebaseUid: user.firebaseUid, email: user.email, emailVerified: true, authenticatedAt: new Date(Date.now() - 1000), signInProvider: "password" }) } });
  return { user, appointment, feature };
}

describe("Birthday privacy and retention", () => {
  it("returns only month/day for active officers, grouping multiple Appointments without leaking years", async () => {
    const campus = await university();
    const other = await university();
    const rep = await officer("REPRESENTATIVE", campus.id);
    await prisma.appointment.create({ data: { portalUserId: rep.user.id, role: "UNIVERSITY_ADMIN", universityId: other.id, startsAt: new Date(Date.now() - 1000) } });
    const ended = await officer("REPRESENTATIVE", campus.id);
    await prisma.appointment.update({ where: { id: ended.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const disabled = await officer("REPRESENTATIVE", campus.id);
    await prisma.portalUser.update({ where: { id: disabled.user.id }, data: { status: "DISABLED" } });
    const result = await rep.feature.list(request({ month: 2 }));
    const visible = result.filter(({ portalUserId }) => portalUserId === rep.user.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ month: 2, day: 28, appointments: expect.any(Array) });
    expect(visible[0].appointments).toHaveLength(2);
    expect(Object.keys(visible[0]).sort()).toEqual(["appointments", "day", "fullName", "month", "portalUserId"]);
    expect(result.some(({ portalUserId }) => portalUserId === ended.user.id || portalUserId === disabled.user.id)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(birthDate);
    expect((await rep.feature.list(request({ month: 3 }))).some(({ portalUserId }) => portalUserId === rep.user.id)).toBe(false);
  });

  it("denies Representatives, unrelated admins, and unknown targets with the same public error", async () => {
    const campus = await university();
    const other = await university();
    const rep = await officer("REPRESENTATIVE", campus.id);
    const unrelated = await officer("UNIVERSITY_ADMIN", other.id);
    for (const actor of [rep, unrelated]) {
      for (const id of [rep.user.id, randomUUID()]) {
        await expect(actor.feature.read(request({ id, idToken: "token" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
        await expect(actor.feature.update(request({ id, idToken: "token", birthDate: "2000-01-01", version: 0 }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
      }
    }
    expect((await unrelated.feature.manageablePeople(request({}))).some(({ id }) => id === rep.user.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { resourceId: rep.user.id, action: { in: ["birth_date.read", "birth_date.updated"] } } })).toBe(0);
  });

  it("audits scoped full-date reads and edits, validates dates, and rejects stale edits", async () => {
    const campus = await university();
    const admin = await officer("UNIVERSITY_ADMIN", campus.id);
    const rep = await officer("REPRESENTATIVE", campus.id);
    const first = await admin.feature.read(request({ id: rep.user.id, idToken: "token" }));
    expect(first).toEqual({ id: rep.user.id, birthDate, version: 0 });
    await admin.feature.update(request({ id: rep.user.id, idToken: "token", birthDate: "2000-02-29", version: 0 }));
    await expect(admin.feature.update(request({ id: rep.user.id, idToken: "token", birthDate: "2001-01-01", version: 0 }))).rejects.toMatchObject({ code: "CONFLICT" });
    for (const invalid of ["2001-02-29", "2999-01-01", "0000-01-01"]) {
      await expect(admin.feature.update(request({ id: rep.user.id, idToken: "token", birthDate: invalid, version: 1 }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    const audits = await prisma.auditLog.findMany({ where: { resourceId: rep.user.id, action: { in: ["birth_date.read", "birth_date.updated"] } }, orderBy: { occurredAt: "asc" } });
    expect(audits.map(({ action }) => action)).toEqual(["birth_date.read", "birth_date.updated"]);
    expect(audits.every(({ metadata }) => JSON.stringify(metadata) === "{}")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("2000-02-29");
    await prisma.appointment.update({ where: { id: rep.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expect(admin.feature.read(request({ id: rep.user.id, idToken: "token" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    const superAdmin = await officer("SUPER_ADMIN", null);
    await expect(superAdmin.feature.read(request({ id: rep.user.id, idToken: "token" }))).resolves.toMatchObject({ birthDate: "2000-02-29" });
  });

  it("rejects expired administrator authority", async () => {
    const campus = await university();
    const admin = await officer("UNIVERSITY_ADMIN", campus.id);
    const rep = await officer("REPRESENTATIVE", campus.id);
    await prisma.appointment.update({ where: { id: admin.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expect(admin.feature.read(request({ id: rep.user.id, idToken: "token" }))).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("removes only expired dates while retaining officer history and protecting recent/future Appointments", async () => {
    const campus = await university();
    const superAdmin = await officer("SUPER_ADMIN", null);
    const old = await officer("REPRESENTATIVE", campus.id);
    const recent = await officer("REPRESENTATIVE", campus.id);
    const future = await officer("REPRESENTATIVE", campus.id);
    for (const person of [old, recent, future]) {
      await prisma.appointment.update({ where: { id: person.appointment.id }, data: { startsAt: new Date("2020-01-01"), endsAt: new Date("2021-01-01") } });
    }
    await prisma.appointment.create({ data: { portalUserId: recent.user.id, universityId: campus.id, role: "REPRESENTATIVE", startsAt: new Date(Date.now() - 10_000), endsAt: new Date(Date.now() - 1000) } });
    await prisma.appointment.create({ data: { portalUserId: future.user.id, universityId: campus.id, role: "REPRESENTATIVE", startsAt: new Date(Date.now() + 86_400_000) } });
    await expect(recent.feature.removeExpired(request({ idToken: "token" }))).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    const result = await superAdmin.feature.removeExpired(request({ idToken: "token" }));
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect((await prisma.portalUser.findUniqueOrThrow({ where: { id: old.user.id } })).birthDate).toBeNull();
    expect(await prisma.appointment.count({ where: { portalUserId: old.user.id } })).toBe(1);
    for (const person of [recent, future, superAdmin]) expect((await prisma.portalUser.findUniqueOrThrow({ where: { id: person.user.id } })).birthDate).not.toBeNull();
  });
});
