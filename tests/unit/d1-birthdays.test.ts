// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createBirthdayFeature,
  type BirthdayRepository,
} from "@/features/directory/server";
import { D1BirthdayRepository } from "@/features/directory/server/d1-birthday-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const universityId = "d4d4d4d4-4444-4444-8444-444444444444";
const representativeId = "e5e5e5e5-5555-4555-8555-555555555555";
const expiredId = "f6f6f6f6-6666-4666-8666-666666666666";

describe("D1 birthdays through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("keeps public birthday results year-free and audits restricted reads and retention", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
    ]);
    const tokenHash = "9".repeat(64);
    const persistence = createD1AccessPersistence<{
      birthdays: BirthdayRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      birthdays: new D1BirthdayRepository(transaction),
    }));
    await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-birthdays",
      fullName: "Birthday Admin",
    });
    await persistence.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-birthdays",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash,
    });
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const birthday = `1998-${String(month).padStart(2, "0")}-12`;
    const oldEnd = new Date(now);
    oldEnd.setUTCFullYear(oldEnd.getUTCFullYear() - 2);
    await database.batch([
      database.prepare(
        "INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)",
      ).bind(universityId, "Member University", "member-university"),
      database.prepare(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name, birth_date)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(representativeId, "firebase-rep-birthday", "rep@unyon.test", "Birthday Representative", birthday),
      database.prepare(
        `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at)
         VALUES (?, ?, 'REPRESENTATIVE', ?, ?)`,
      ).bind("11111111-1111-4111-8111-111111111111", representativeId, universityId, "2020-01-01T00:00:00.000Z"),
      database.prepare(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name, birth_date)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(expiredId, "firebase-expired-birthday", "expired@unyon.test", "Former Representative", "1990-04-05"),
      database.prepare(
        `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at, ends_at)
         VALUES (?, ?, 'REPRESENTATIVE', ?, ?, ?)`,
      ).bind("22222222-2222-4222-8222-222222222222", expiredId, universityId, "2020-01-01T00:00:00.000Z", oldEnd.toISOString()),
    ]);
    const identityVerifier = {
      verifyIdToken: async () => ({
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-birthdays",
        signInProvider: "password",
      }),
    };
    const feature = createBirthdayFeature({
      sessions: { hashSessionToken: async () => tokenHash },
      transactions: persistence.transactions,
      identityVerifier,
    });
    const sessionToken = "birthday-admin-session";

    const publicRecords = await feature.list({
      correlationId: "public-birthdays",
      sessionToken,
      input: { month },
    });
    expect(publicRecords).toEqual([
      expect.objectContaining({
        day: 12,
        fullName: "Birthday Representative",
        month,
        portalUserId: representativeId,
      }),
    ]);
    expect(publicRecords[0]).not.toHaveProperty("birthDate");
    expect(publicRecords[0]).not.toHaveProperty("year");

    await expect(
      feature.read({
        correlationId: "restricted-read",
        sessionToken,
        input: { id: representativeId, idToken: "fresh-password-token" },
      }),
    ).resolves.toMatchObject({ birthDate: birthday, version: 0 });
    await feature.update({
      correlationId: "restricted-update",
      sessionToken,
      input: {
        id: representativeId,
        idToken: "fresh-password-token",
        birthDate: "1999-06-15",
        version: 0,
      },
    });
    await expect(
      feature.removeExpired({
        correlationId: "retention",
        sessionToken,
        input: { idToken: "fresh-password-token" },
      }),
    ).resolves.toEqual({ removed: 1 });

    await expect(
      database.prepare("SELECT birth_date FROM portal_users WHERE id = ?")
        .bind(expiredId)
        .first<{ birth_date: string | null }>(),
    ).resolves.toEqual({ birth_date: null });
    await expect(
      database.prepare("SELECT action FROM audit_logs WHERE action LIKE 'birth_date.%'").all<{
        action: string;
      }>(),
    ).resolves.toMatchObject({
      results: expect.arrayContaining([
        { action: "birth_date.read" },
        { action: "birth_date.updated" },
        { action: "birth_date.retention_applied" },
      ]),
    });
  });
});
