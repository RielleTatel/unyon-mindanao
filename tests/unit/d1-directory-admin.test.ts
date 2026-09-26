// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createAccountFeature,
  createProfileFeature,
  createRepresentativeAppointmentFeature,
  type AccountRepository,
  type ProfileRepository,
  type RepresentativeAppointmentRepository,
} from "@/features/directory/server";
import { D1AccountRepository } from "@/features/directory/server/d1-account-repository";
import { D1ProfileRepository } from "@/features/directory/server/d1-profile-repository";
import { D1RepresentativeAppointmentRepository } from "@/features/directory/server/d1-representative-appointment-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const universityId = "12345678-1234-4234-8234-123456789012";
const representativeId = "23456789-2345-4234-8234-123456789012";
const representativeAppointmentId = "34567890-3456-4234-8234-123456789012";
const representativeTokenHash = "8".repeat(64);
const adminTokenHash = "7".repeat(64);

describe("D1 directory administration through feature interfaces", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("returns role-scoped profiles and ends a Representative Appointment with session revocation", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
    ]);
    const access = createD1AccessPersistence(database as unknown as D1Database);
    await createSuperAdminBootstrap(access.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-directory-admin",
      fullName: "Directory Administrator",
    });
    await access.sessions.start({
      correlationId: "admin-session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-directory-admin",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: adminTokenHash,
    });
    await database.batch([
      database.prepare(
        "INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)",
      ).bind(universityId, "Member University", "member-university"),
      database.prepare(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name, birth_date)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(representativeId, "firebase-representative-profile", "rep@unyon.test", "Representative User", "2001-03-17"),
      database.prepare(
        `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at)
         VALUES (?, ?, 'REPRESENTATIVE', ?, ?)`,
      ).bind(representativeAppointmentId, representativeId, universityId, "2020-01-01T00:00:00.000Z"),
    ]);
    await access.sessions.start({
      correlationId: "representative-session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "rep@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-representative-profile",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: representativeTokenHash,
    });
    const verifier = {
      verifyIdToken: async () => ({
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-directory-admin",
        signInProvider: "password",
      }),
    };
    const profilePersistence = createD1AccessPersistence<{
      profile: ProfileRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      profile: new D1ProfileRepository(transaction),
    }));
    const profile = createProfileFeature({
      sessions: { hashSessionToken: async () => representativeTokenHash },
      transactions: profilePersistence.transactions,
    });
    await expect(
      profile.get({
        correlationId: "profile",
        sessionToken: "representative-session",
        input: {},
      }),
    ).resolves.toMatchObject({
      id: representativeId,
      birthday: { month: 3, day: 17 },
      appointments: [{ role: "REPRESENTATIVE", university: { name: "Member University" } }],
    });

    const representativePersistence = createD1AccessPersistence<{
      representativeAppointments: RepresentativeAppointmentRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      representativeAppointments: new D1RepresentativeAppointmentRepository(transaction),
    }));
    const representatives = createRepresentativeAppointmentFeature({
      sessions: { hashSessionToken: async () => adminTokenHash },
      transactions: representativePersistence.transactions,
      identityVerifier: verifier,
    });
    await expect(
      representatives.list({
        correlationId: "representative-list",
        sessionToken: "admin-session",
        input: {},
      }),
    ).resolves.toMatchObject([{ id: representativeAppointmentId, active: true }]);
    await representatives.end({
      correlationId: "representative-end",
      sessionToken: "admin-session",
      input: { id: representativeAppointmentId, idToken: "fresh-admin-password-token" },
    });
    await expect(
      database.prepare("SELECT revoked_at FROM portal_sessions WHERE token_hash = ?")
        .bind(representativeTokenHash)
        .first<{ revoked_at: string | null }>(),
    ).resolves.toMatchObject({ revoked_at: expect.any(String) });

    const accountPersistence = createD1AccessPersistence<{
      accounts: AccountRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      accounts: new D1AccountRepository(transaction),
    }));
    const accounts = createAccountFeature({
      sessions: { hashSessionToken: async () => adminTokenHash },
      transactions: accountPersistence.transactions,
      identityVerifier: verifier,
    });
    const accountList = await accounts.list({
      correlationId: "account-list",
      sessionToken: "admin-session",
      input: {},
    });
    expect(accountList.people).toEqual(expect.arrayContaining([
      { id: representativeId, fullName: "Representative User", email: "rep@unyon.test", status: "ACTIVE" },
    ]));
  });
});
