import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, createAuditHistoryFeature, PrismaAuditHistoryRepository, type PortalRole } from "@/features/access/server";
import { createAccountFeature, PrismaAccountRepository } from "@/features/directory/server";
import { createPrismaClient } from "@/platform/database/client";
config({ path: ".env.local", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Test database required");
const prisma = createPrismaClient(url); afterAll(() => prisma.$disconnect());
const call = (input: unknown) => ({ input, sessionToken: "session", correlationId: randomUUID() });
async function actor(role: PortalRole) {
  const university = role === "SUPER_ADMIN" ? null : await prisma.memberUniversity.create({ data: { name: randomUUID(), slug: randomUUID() } });
  const user = await prisma.portalUser.create({ data: { firebaseUid: randomUUID(), email: `${randomUUID()}@unyon.test`, fullName: "Account Actor" } });
  const appointment = await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId: university?.id, startsAt: new Date(Date.now() - 10000) } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 300000) } });
  const persistence = createAccessPersistence(prisma, (transaction) => ({ accounts: new PrismaAccountRepository(transaction) }));
  const identityVerifier = { verifyIdToken: async (token: string) => ({ firebaseUid: user.firebaseUid, email: user.email, emailVerified: true, signInProvider: "password", authenticatedAt: new Date(Date.now() - (token === "stale" ? 600000 : 1000)) }) };
  return { user, appointment, persistence, tokenHash, feature: createAccountFeature({ transactions: persistence.transactions, identityVerifier, sessions: { hashSessionToken: async () => tokenHash } }) };
}
describe("Account administration", () => {
  it("limits audit history to Super Admins and returns redacted fields", async () => {
    const admin = await actor("SUPER_ADMIN"); const rep = await actor("REPRESENTATIVE");
    const featureFor = (tokenHash: string) => {
      const persistence = createAccessPersistence(prisma, (transaction) => ({ auditHistory: new PrismaAuditHistoryRepository(transaction) }));
      return createAuditHistoryFeature({ transactions: persistence.transactions, sessions: { hashSessionToken: async () => tokenHash } });
    };
    await admin.feature.list(call({}));
    const records = await featureFor(admin.tokenHash).recent(call({}));
    expect(records.length).toBeGreaterThan(0);
    expect(Object.keys(records[0]).sort()).toEqual(["action", "actorName", "id", "occurredAt", "resourceId", "resourceType"]);
    await expect(featureFor(rep.tokenHash).recent(call({}))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });
  it("requires fresh password, preserves history and never revives revoked sessions on restore", async () => {
    const admin = await actor("SUPER_ADMIN"); const target = await actor("UNIVERSITY_ADMIN");
    await expect(admin.feature.setStatus(call({ id: target.user.id, status: "DISABLED", idToken: "stale" }))).rejects.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });
    await admin.feature.setStatus(call({ id: target.user.id, status: "DISABLED", idToken: "fresh" }));
    expect(await target.persistence.sessions.resolve({ tokenHash: target.tokenHash, correlationId: randomUUID() })).toBeNull();
    await admin.feature.setStatus(call({ id: target.user.id, status: "ACTIVE", idToken: "fresh" }));
    expect(await target.persistence.sessions.resolve({ tokenHash: target.tokenHash, correlationId: randomUUID() })).toBeNull();
    expect(await prisma.appointment.findUnique({ where: { id: target.appointment.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { resourceId: target.user.id, action: "account.status_changed" } })).toBe(2);
  });
  it("denies University Admin authority and self-disable; ends another administrator's final Appointment", async () => {
    const admin = await actor("SUPER_ADMIN"); const target = await actor("UNIVERSITY_ADMIN");
    await expect(target.feature.list(call({}))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(target.feature.setStatus(call({ id: admin.user.id, status: "DISABLED", idToken: "fresh" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(admin.feature.setStatus(call({ id: admin.user.id, status: "DISABLED", idToken: "fresh" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await admin.feature.endAppointment(call({ id: target.appointment.id, idToken: "fresh" }));
    expect(await target.persistence.sessions.resolve({ tokenHash: target.tokenHash, correlationId: randomUUID() })).toBeNull();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: target.appointment.id } })).endsAt).not.toBeNull();
  });
});
