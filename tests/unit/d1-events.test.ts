// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createEventFeature,
  type EventCapabilities,
} from "@/features/events/server";
import { D1EventRepository } from "@/features/events/server/d1-event-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const ownerUniversityId = "a1a1a1a1-1111-4111-8111-111111111111";
const coHostUniversityId = "b2b2b2b2-2222-4222-8222-222222222222";
const eventId = "c3c3c3c3-3333-4333-8333-333333333333";
const adminTokenHash = "f".repeat(64);

describe("D1 events through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("creates a draft with co-hosts, publishes it, edits details, and audits each mutation", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
      "0004_invitations.sql",
      "0005_evaluations_and_reports.sql",
    ]);
    const persistence = createD1AccessPersistence<EventCapabilities>(
      database as unknown as D1Database,
      (transaction) => ({ events: new D1EventRepository(transaction) }),
    );
    await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-events",
      fullName: "Events Admin",
    });
    await persistence.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-events",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: adminTokenHash,
    });
    await database.batch([
      database.prepare(
        `INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)`,
      ).bind(ownerUniversityId, "Owner University", "owner-university"),
      database.prepare(
        `INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)`,
      ).bind(coHostUniversityId, "Co-host University", "co-host-university"),
    ]);
    const feature = createEventFeature({
      sessions: { hashSessionToken: async () => adminTokenHash },
      transactions: persistence.transactions,
    });
    const sessionToken = "events-admin-session";
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const endsAt = new Date(Date.now() + 90_000_000).toISOString();

    const created = await feature.create({
      correlationId: "event-create",
      sessionToken,
      input: {
        eventId,
        title: "Regional Student Summit",
        description: "Gathering for member university representatives.",
        category: "Leadership",
        startsAt,
        endsAt,
        allDay: false,
        location: "Davao City",
        onlineUrl: "",
        contactPerson: "Events team",
        ownerUniversityId,
        coHostUniversityIds: [coHostUniversityId],
      },
    });
    expect(created).toMatchObject({
      id: eventId,
      ownerUniversityName: "Owner University",
      coHosts: [{ id: coHostUniversityId, name: "Co-host University" }],
      manageable: true,
      status: "DRAFT",
      version: 1,
    });

    const published = await feature.publish({
      correlationId: "event-publish",
      sessionToken,
      input: { id: eventId, version: 1 },
    });
    expect(published).toMatchObject({ status: "PUBLISHED", version: 2 });

    const edited = await feature.edit({
      correlationId: "event-edit",
      sessionToken,
      input: {
        id: eventId,
        version: 2,
        title: "Regional Student Summit 2026",
        description: "Updated summit details.",
        location: "Davao Convention Center",
        onlineUrl: "",
        contactPerson: "Summit organizers",
      },
    });
    expect(edited).toMatchObject({
      title: "Regional Student Summit 2026",
      location: "Davao Convention Center",
      version: 3,
    });

    await expect(
      feature.list({
        correlationId: "event-list",
        sessionToken,
        input: { includeArchived: false, upcomingOnly: true, search: "summit 2026" },
      }),
    ).resolves.toMatchObject([{ id: eventId, status: "PUBLISHED", version: 3 }]);
    await expect(
      database.prepare(
        "SELECT action FROM audit_logs WHERE action LIKE 'event.%' ORDER BY action",
      ).all<{ action: string }>(),
    ).resolves.toMatchObject({ results: expect.arrayContaining([
      { action: "event.draft_created" },
      { action: "event.published" },
      { action: "event.edited" },
    ]) });
  });
});
