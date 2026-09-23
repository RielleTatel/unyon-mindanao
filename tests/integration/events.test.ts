import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

import { createAccessPersistence } from "@/features/access/server";
import { createEventFeature } from "@/features/events/server";
import { PrismaEventRepository } from "@/features/events/server/prisma-event-repository";
import { createPrismaClient } from "@/platform/database/client";
import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";

config({ path: ".env.local" });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated database ending in _test");
}

const prisma = createPrismaClient(testDatabaseUrl);

describe("Event persistence and access", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it("persists a University Event, co-host attribution, lifecycle audits, and denies co-host edits", async () => {
    const ownerUniversity = await createUniversity("Event Owner");
    const coHostUniversity = await createUniversity("Event Co-host");
    const universityAdmin = await createActor("UNIVERSITY_ADMIN", ownerUniversity.id);
    const superAdmin = await createActor("SUPER_ADMIN", null);
    const representative = await createActor("REPRESENTATIVE", coHostUniversity.id);
    const coHostAdmin = await createActor("UNIVERSITY_ADMIN", coHostUniversity.id);
    const ownerFeature = createFeature(universityAdmin.tokenHash);
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const eventId = randomUUID();
    const auditCorrelation = randomUUID();

    const draft = await ownerFeature.create({
      correlationId: auditCorrelation,
      sessionToken: universityAdmin.sessionToken,
      input: {
        eventId,
        title: "Mindanao Student Congress",
        description: "A regional gathering for student leaders.",
        category: "Congress",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: false,
        location: "Davao City",
        onlineUrl: "",
        contactPerson: "Unyon Secretariat",
        ownerUniversityId: ownerUniversity.id,
        coHostUniversityIds: [coHostUniversity.id],
      },
    });
    expect(draft).toMatchObject({ status: "DRAFT", ownerUniversityName: ownerUniversity.name, manageable: true });
    expect(draft.coHosts).toEqual([{ id: coHostUniversity.id, name: coHostUniversity.name }]);

    await ownerFeature.publish({
      correlationId: auditCorrelation,
      sessionToken: universityAdmin.sessionToken,
      input: { id: eventId, version: draft.version },
    });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event).toMatchObject({ status: "PUBLISHED", ownerUniversityId: ownerUniversity.id, version: 2 });
    expect(await prisma.auditLog.findMany({ where: { correlationId: auditCorrelation }, orderBy: { occurredAt: "asc" } }))
      .toMatchObject([{ action: "event.draft_created" }, { action: "event.published" }]);

    const representativeFeature = createFeature(representative.tokenHash);
    await expect(representativeFeature.get({
      correlationId: randomUUID(), sessionToken: representative.sessionToken, input: { id: eventId },
    })).resolves.toMatchObject({ title: "Mindanao Student Congress", status: "PUBLISHED", manageable: false });

    const coHostFeature = createFeature(coHostAdmin.tokenHash);
    await expect(coHostFeature.cancel({
      correlationId: randomUUID(), sessionToken: coHostAdmin.sessionToken, input: { id: eventId, version: 2 },
    })).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({ status: "PUBLISHED", version: 2 });

    const superFeature = createFeature(superAdmin.tokenHash);
    await expect(superFeature.get({
      correlationId: randomUUID(), sessionToken: superAdmin.sessionToken, input: { id: eventId },
    })).resolves.toMatchObject({ status: "PUBLISHED", manageable: true });
  });
});

async function createUniversity(prefix: string) {
  const suffix = randomUUID();
  return prisma.memberUniversity.create({
    data: { name: `${prefix} ${suffix}`, slug: `${prefix.toLowerCase().replaceAll(" ", "-")}-${suffix}` },
  });
}

async function createActor(role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE", universityId: string | null) {
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS "now"`;
  const user = await prisma.portalUser.create({
    data: { email: `${role.toLowerCase()}-${randomUUID()}@unyon.test`, firebaseUid: `firebase-${randomUUID()}`, fullName: "Events Integration Actor" },
  });
  await prisma.appointment.create({
    data: { portalUserId: user.id, role, universityId, startsAt: new Date(now.getTime() - 60_000) },
  });
  const sessionToken = webCryptoSessionTokens.create();
  const tokenHash = await webCryptoSessionTokens.hash(sessionToken);
  await prisma.portalSession.create({
    data: { expiresAt: new Date(now.getTime() + 60 * 60 * 1000), portalUserId: user.id, tokenHash },
  });
  return { sessionToken, tokenHash };
}

function createFeature(tokenHash: string) {
  const persistence = createAccessPersistence(prisma, (transaction) => ({
    events: new PrismaEventRepository(transaction),
  }));
  return createEventFeature({
    sessions: { hashSessionToken: async () => tokenHash },
    transactions: persistence.transactions,
  });
}
