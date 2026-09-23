import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuditRecord, PortalActor, VerifiedIdentity } from "@/features/access/server";
import { createRepresentativeAppointmentFeature } from "@/features/directory/server";

const now = new Date("2026-09-22T00:00:00Z");
const universityId = randomUUID();
const id = randomUUID();
const actor: PortalActor = { portalUserId: randomUUID(), firebaseUid: "admin", email: "admin@unyon.test", appointments: [{ id: randomUUID(), role: "UNIVERSITY_ADMIN", universityId }] };
const identity: VerifiedIdentity = { firebaseUid: actor.firebaseUid, email: actor.email, emailVerified: true, authenticatedAt: now, signInProvider: "password" };
const request = (input: unknown) => ({ input, sessionToken: "session", correlationId: "request" });

function setup(currentActor = actor, verifiedIdentity = identity) {
  const audits: AuditRecord[] = [];
  const repository = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ id, portalUserId: "officer", fullName: "Officer", email: "officer@unyon.test", universityId, universityName: "University", startsAt: now.toISOString(), endsAt: null, active: true })),
    end: vi.fn(async () => ({ sessionsRevoked: true })),
  };
  const feature = createRepresentativeAppointmentFeature({
    sessions: { hashSessionToken: async () => "hash" },
    identityVerifier: { verifyIdToken: async () => verifiedIdentity },
    transactions: { run: async (_input, work) => work({ occurredAt: now, capabilities: { representativeAppointments: repository }, appendAudit: async (record) => { audits.push(record); } }, currentActor) },
  });
  return { feature, repository, audits };
}

describe("Representative officer turnover", () => {
  it.each(["SUPER_ADMIN", "UNIVERSITY_ADMIN"] as const)("allows %s to end an Appointment and audits without credentials", async (role) => {
    const { feature, audits } = setup({ ...actor, appointments: [{ id: "admin", role, universityId: role === "SUPER_ADMIN" ? null : universityId }] });
    await expect(feature.end(request({ id, idToken: "secret-id-token" }))).resolves.toEqual({ sessionsRevoked: true });
    expect(audits).toMatchObject([{ action: "representative_appointment.ended", resourceId: id, metadata: { sessionsRevoked: true } }]);
    expect(JSON.stringify(audits)).not.toContain("secret-id-token");
  });

  it.each([
    [{ id: "rep", role: "REPRESENTATIVE" as const, universityId }],
    [{ id: "other", role: "UNIVERSITY_ADMIN" as const, universityId: randomUUID() }],
    [],
  ])("denies unauthorized Appointments %j", async (...appointments) => {
    const { feature, repository } = setup({ ...actor, appointments: appointments.flat() });
    await expect(feature.end(request({ id, idToken: "token" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(repository.end).not.toHaveBeenCalled();
  });

  it.each([
    { authenticatedAt: new Date(now.getTime() - 300_001) },
    { authenticatedAt: new Date(now.getTime() + 1) },
    { firebaseUid: "someone-else" },
    { emailVerified: false },
    { signInProvider: "google.com" },
  ])("requires the administrator's recent verified password identity: %j", async (override) => {
    const { feature, repository } = setup(actor, { ...identity, ...override });
    await expect(feature.end(request({ id, idToken: "token" }))).rejects.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });
    expect(repository.end).not.toHaveBeenCalled();
  });

  it("scopes University Admin history and allows Super Admin history across universities", async () => {
    const local = setup();
    await local.feature.list(request({}));
    expect(local.repository.list).toHaveBeenCalledWith([universityId], now);
    const global = setup({ ...actor, appointments: [{ id: "super", role: "SUPER_ADMIN", universityId: null }] });
    await global.feature.list(request({}));
    expect(global.repository.list).toHaveBeenCalledWith(undefined, now);
  });
});
