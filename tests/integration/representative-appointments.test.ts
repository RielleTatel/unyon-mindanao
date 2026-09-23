import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, type PortalRole } from "@/features/access/server";
import { createRepresentativeAppointmentFeature } from "@/features/directory/server";
import { PrismaRepresentativeAppointmentRepository } from "@/features/directory/server/prisma-representative-appointment-repository";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local" });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("A dedicated _test database is required");
const prisma = createPrismaClient(url);
afterAll(() => prisma.$disconnect());
const request = (input: unknown) => ({ correlationId: randomUUID(), input, sessionToken: "session" });

async function university() {
  return prisma.memberUniversity.create({ data: { name: `Turnover ${randomUUID()}`, slug: randomUUID() } });
}

async function officer(role: PortalRole, universityId: string | null) {
  const user = await prisma.portalUser.create({ data: { email: `${randomUUID()}@unyon.test`, firebaseUid: randomUUID(), fullName: "Turnover Officer" } });
  const appointment = await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId, startsAt: new Date(Date.now() - 60_000) } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const session = await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) } });
  const persistence = createAccessPersistence(prisma, (transaction) => ({ representativeAppointments: new PrismaRepresentativeAppointmentRepository(transaction) }));
  const feature = createRepresentativeAppointmentFeature({
    sessions: { hashSessionToken: async () => tokenHash }, transactions: persistence.transactions,
    identityVerifier: { verifyIdToken: async () => ({ email: user.email, firebaseUid: user.firebaseUid, emailVerified: true, authenticatedAt: new Date(Date.now() - 1000), signInProvider: "password" }) },
  });
  return { user, appointment, session, tokenHash, persistence, feature };
}

describe("Representative Appointment persistence", () => {
  it("preserves history and attribution, revokes every session after the final Appointment, and permits a later Appointment", async () => {
    const campus = await university();
    const admin = await officer("UNIVERSITY_ADMIN", campus.id);
    const rep = await officer("REPRESENTATIVE", campus.id);
    const call = request({ id: rep.appointment.id, idToken: "confirmed-password" });
    await expect(admin.feature.end(call)).resolves.toEqual({ sessionsRevoked: true });
    await expect(rep.persistence.sessions.resolve({ tokenHash: rep.tokenHash, correlationId: randomUUID() })).resolves.toBeNull();
    expect((await prisma.portalSession.findUniqueOrThrow({ where: { id: rep.session.id } })).revokedAt).not.toBeNull();
    expect((await prisma.portalUser.findUniqueOrThrow({ where: { id: rep.user.id } })).status).toBe("ACTIVE");
    const history = await admin.feature.list(request({}));
    expect(history).toContainEqual(expect.objectContaining({ id: rep.appointment.id, portalUserId: rep.user.id, active: false, endsAt: expect.any(String) }));
    await expect(prisma.auditLog.findFirst({ where: { correlationId: call.correlationId } })).resolves.toMatchObject({ action: "representative_appointment.ended", resourceId: rep.appointment.id, actorPortalUserId: admin.user.id });
    await expect(admin.feature.end(request({ id: rep.appointment.id, idToken: "confirmed" }))).rejects.toMatchObject({ code: "CONFLICT" });
    await prisma.appointment.create({ data: { portalUserId: rep.user.id, universityId: campus.id, role: "REPRESENTATIVE", startsAt: new Date() } });
    expect(await prisma.appointment.count({ where: { portalUserId: rep.user.id } })).toBe(2);
    await expect(rep.persistence.sessions.resolve({ tokenHash: rep.tokenHash, correlationId: randomUUID() })).resolves.toBeNull();
  });

  it("removes only the ended university's authority when another Appointment remains", async () => {
    const campus = await university();
    const other = await university();
    const admin = await officer("SUPER_ADMIN", null);
    const rep = await officer("REPRESENTATIVE", campus.id);
    const retained = await prisma.appointment.create({ data: { portalUserId: rep.user.id, universityId: other.id, role: "REPRESENTATIVE", startsAt: new Date(Date.now() - 1000) } });
    await expect(admin.feature.end(request({ id: rep.appointment.id, idToken: "confirmed" }))).resolves.toEqual({ sessionsRevoked: false });
    const actor = await rep.persistence.sessions.resolve({ tokenHash: rep.tokenHash, correlationId: randomUUID() });
    expect(actor?.appointments).toEqual([{ id: retained.id, role: "REPRESENTATIVE", universityId: other.id }]);
  });

  it("denies and audits wrong-university and expired administrator access without exposing targets", async () => {
    const campus = await university();
    const other = await university();
    const admin = await officer("UNIVERSITY_ADMIN", campus.id);
    const rep = await officer("REPRESENTATIVE", other.id);
    const denied = request({ id: rep.appointment.id, idToken: "confirmed" });
    await expect(admin.feature.end(denied)).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(admin.feature.end(request({ id: randomUUID(), idToken: "confirmed" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(await admin.feature.list(request({}))).toEqual([]);
    await expect(prisma.auditLog.findFirst({ where: { correlationId: denied.correlationId } })).resolves.toMatchObject({ action: "access.denied", metadata: { reason: "NOT_FOUND_OR_FORBIDDEN" } });
    await prisma.appointment.update({ where: { id: admin.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const expired = request({ id: rep.appointment.id, idToken: "confirmed" });
    await expect(admin.feature.end(expired)).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(prisma.auditLog.findFirst({ where: { correlationId: expired.correlationId } })).resolves.toMatchObject({ action: "access.denied", metadata: { reason: "AUTHENTICATION_REQUIRED" } });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: rep.appointment.id } })).endsAt).toBeNull();
  });

  it("commits only one concurrent turnover operation", async () => {
    const campus = await university();
    const admin = await officer("UNIVERSITY_ADMIN", campus.id);
    const rep = await officer("REPRESENTATIVE", campus.id);
    const results = await Promise.allSettled([1, 2].map(() => admin.feature.end(request({ id: rep.appointment.id, idToken: "confirmed" }))));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { resourceId: rep.appointment.id, action: "representative_appointment.ended" } })).toBe(1);
  });
});
