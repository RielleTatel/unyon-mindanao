// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createEvaluationFeature,
  type EvaluationRepository,
} from "@/features/evaluations/server";
import { D1EvaluationRepository } from "@/features/evaluations/server/d1-evaluation-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const universityId = "45678901-4567-4567-8567-456789012345";
const eventId = "56789012-5678-4678-8678-567890123456";
const representativeId = "67890123-6789-4789-8789-678901234567";
const adminTokenHash = "6".repeat(64);
const representativeTokenHash = "5".repeat(64);

describe("D1 evaluations through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("opens a template snapshot, saves eligible responses, and honors close-time updates", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
      "0004_invitations.sql",
      "0005_evaluations_and_reports.sql",
    ]);
    const access = createD1AccessPersistence(database as unknown as D1Database);
    await createSuperAdminBootstrap(access.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-evaluations",
      fullName: "Evaluation Admin",
    });
    await access.sessions.start({
      correlationId: "admin-session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-evaluations",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: adminTokenHash,
    });
    const now = new Date();
    const endsAt = new Date(now.getTime() - 2 * 86_400_000);
    const startsAt = new Date(endsAt.getTime() - 86_400_000);
    await database.batch([
      database.prepare(
        "INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)",
      ).bind(universityId, "Evaluation University", "evaluation-university"),
      database.prepare(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name)
         VALUES (?, ?, ?, ?)`,
      ).bind(representativeId, "firebase-rep-evaluations", "rep@unyon.test", "Evaluation Representative"),
      database.prepare(
        `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at)
         VALUES (?, ?, 'REPRESENTATIVE', ?, ?)`,
      ).bind("78901234-7890-4890-8890-789012345678", representativeId, universityId, "2020-01-01T00:00:00.000Z"),
      database.prepare(
        `INSERT INTO events
          (id, title, description, category, status, starts_at, ends_at, location,
           owner_university_id, created_by_portal_user_id, published_at)
         VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        eventId,
        "Evaluation Event",
        "A completed event with an open evaluation window.",
        "Leadership",
        startsAt.toISOString(),
        endsAt.toISOString(),
        "Davao City",
        universityId,
        (await database.prepare("SELECT id FROM portal_users WHERE firebase_uid = ?")
          .bind("firebase-admin-evaluations").first<{ id: string }>())!.id,
        new Date(endsAt.getTime() - 86_400_000).toISOString(),
      ),
    ]);
    await access.sessions.start({
      correlationId: "representative-session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "rep@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-rep-evaluations",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: representativeTokenHash,
    });
    const persistence = createD1AccessPersistence<{
      evaluations: EvaluationRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      evaluations: new D1EvaluationRepository(transaction),
    }));
    const feature = createEvaluationFeature({
      sessions: { hashSessionToken: async (value) =>
        value === "admin-session" ? adminTokenHash : representativeTokenHash },
      transactions: persistence.transactions,
    });

    await expect(
      feature.list({
        correlationId: "evaluation-list",
        sessionToken: "representative-session",
        input: {},
      }),
    ).resolves.toMatchObject([
      { eventId, canRespond: true, templateVersion: 1, response: null },
    ]);

    const answers = [
      { position: 0, rating: 5, comment: null },
      { position: 1, rating: 4, comment: null },
      { position: 2, rating: null, comment: "Helpful and well organized." },
    ];
    await feature.submit({
      correlationId: "evaluation-submit",
      sessionToken: "representative-session",
      input: { id: eventId, version: 0, answers },
    });
    await expect(
      feature.list({
        correlationId: "evaluation-list-after-submit",
        sessionToken: "representative-session",
        input: {},
      }),
    ).resolves.toMatchObject([
      { eventId, response: { version: 1, answers } },
    ]);
    await expect(
      feature.submit({
        correlationId: "duplicate-submit",
        sessionToken: "representative-session",
        input: { id: eventId, version: 0, answers },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const adminResults = await feature.results({
      correlationId: "admin-results",
      sessionToken: "admin-session",
      input: { id: eventId },
    });
    expect(adminResults).toMatchObject({
      disclosure: "ATTRIBUTABLE",
      count: 1,
      responses: [{ fullName: "Evaluation Representative", email: "rep@unyon.test" }],
    });

    await feature.updateWindow({
      correlationId: "close-window",
      sessionToken: "admin-session",
      input: {
        id: eventId,
        version: 1,
        closed: true,
        closesAt: new Date(now.getTime() + 86_400_000).toISOString(),
      },
    });
    await expect(
      feature.list({
        correlationId: "evaluation-list-closed",
        sessionToken: "representative-session",
        input: {},
      }),
    ).resolves.toMatchObject([{ eventId, closed: true, canRespond: false }]);
  });
});
