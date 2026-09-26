// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import { D1UniversityAdminInvitationRepository } from "@/features/directory/server/d1-university-admin-invitation-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const universityId = "d4d4d4d4-4444-4444-8444-444444444444";
const invitationId = "e5e5e5e5-5555-4555-8555-555555555555";

describe("D1 invitation acceptance", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("accepts a valid invitation atomically and records the new Appointment", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
      "0004_invitations.sql",
    ]);
    const repository = new D1UniversityAdminInvitationRepository(
      database as unknown as D1Database,
    );
    const inviter = await createSuperAdminBootstrap(
      (await createD1AccessPersistence(database as unknown as D1Database)).superAdminBootstrap,
    )({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-invitations",
      fullName: "Invitation Admin",
    });
    await database.batch([
      database.prepare("INSERT INTO member_universities (id, name, slug) VALUES (?, ?, ?)")
        .bind(universityId, "Member University", "member-university"),
      database.prepare(
        "INSERT INTO invitations (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at) VALUES (?, ?, ?, 'REPRESENTATIVE', ?, ?, ?)",
      ).bind(invitationId, "a".repeat(64), "rep@unyon.test", universityId, inviter.portalUserId, new Date(Date.now() + 86400000).toISOString()),
    ]);

    await expect(repository.preview("a".repeat(64))).resolves.toMatchObject({
      email: "rep@unyon.test",
      role: "REPRESENTATIVE",
      universityName: "Member University",
    });
    const accepted = await repository.accept({
      correlationId: "accept-invitation",
      fullName: "New Representative",
      identity: { email: "rep@unyon.test", emailVerified: true, firebaseUid: "firebase-new-rep" },
      tokenHash: "a".repeat(64),
    });
    await expect(database.prepare(
      "SELECT role, university_id FROM appointments WHERE portal_user_id = ?",
    ).bind(accepted.portalUserId).first<{ role: string; university_id: string }>())
      .resolves.toEqual({ role: "REPRESENTATIVE", university_id: universityId });
    await expect(database.prepare(
      "SELECT status FROM invitations WHERE id = ?",
    ).bind(invitationId).first<{ status: string }>()).resolves.toEqual({ status: "ACCEPTED" });
    await expect(database.prepare(
      "SELECT action, correlation_id FROM audit_logs WHERE resource_id = ?",
    ).bind(invitationId).first<{ action: string; correlation_id: string }>())
      .resolves.toEqual({ action: "representative_invitation.accepted", correlation_id: "accept-invitation" });
    await expect(repository.preview("a".repeat(64))).resolves.toBeNull();
  });
});
