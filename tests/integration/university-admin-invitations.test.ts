import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

import {
  AccessError,
  createAccessPersistence,
  createSessionService,
  type IdentityVerifier,
  type PortalActor,
} from "@/features/access/server";
import {
  createUniversityAdminInvitationFeature,
} from "@/features/directory/server";
import {
  acceptUniversityAdminInvitation,
  previewUniversityAdminInvitation,
  PrismaUniversityAdminInvitationRepository,
} from "@/features/directory/server/prisma-university-admin-invitation-repository";
import { createPrismaClient } from "@/platform/database/client";
import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";

config({ path: ".env.local" });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated database ending in _test");
}

const prisma = createPrismaClient(testDatabaseUrl);

describe("University Admin invitation persistence", () => {
  afterAll(async () => {
    await prisma.memberUniversity.updateMany({
      data: { status: "ARCHIVED" },
      where: { name: { startsWith: "Invitation University " } },
    });
    await prisma.$disconnect();
  });

  it("persists a hashed seven-day invitation and transactionally creates the Portal User and Appointment", async () => {
    const context = await createContext();
    const invitedEmail = `admin-${randomUUID()}@unyon.test`;
    const invitation = await context.feature.invite(context.request({
      email: ` ${invitedEmail.toUpperCase()} `,
      universityId: context.university.id,
    }));
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    const rawToken = new URL(context.sentLinks[0]!).hash.slice(1);
    const expectedHash = await webCryptoSessionTokens.hash(rawToken);

    expect(stored).toMatchObject({
      email: invitedEmail,
      role: "UNIVERSITY_ADMIN",
      status: "PENDING",
      universityId: context.university.id,
      invitedByPortalUserId: context.superAdmin.portalUserId,
      tokenHash: expectedHash,
    });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(
      Math.abs(
        stored.expiresAt.getTime() -
          stored.createdAt.getTime() -
          7 * 24 * 60 * 60 * 1000,
      ),
    ).toBeLessThan(2_000);

    context.setIdentity({
      authenticatedAt: new Date(),
      email: invitedEmail,
      emailVerified: true,
      firebaseUid: `firebase-${randomUUID()}`,
    });
    const accepted = await context.feature.accept({
      correlationId: "invitation-acceptance",
      fullName: "Invited University Admin",
      idToken: "verified-firebase-id-token",
      token: rawToken,
    });

    const acceptedRecord = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    const portalUser = await prisma.portalUser.findUniqueOrThrow({ where: { id: accepted.portalUserId } });
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { portalUserId: accepted.portalUserId, universityId: context.university.id },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "university_admin_invitation.accepted", resourceId: invitation.id },
    });

    expect(acceptedRecord).toMatchObject({
      status: "ACCEPTED",
      acceptedByPortalUserId: accepted.portalUserId,
    });
    expect(portalUser).toMatchObject({ email: invitedEmail, fullName: "Invited University Admin" });
    expect(appointment).toMatchObject({ role: "UNIVERSITY_ADMIN", universityId: context.university.id });
    expect(audit).toMatchObject({
      actorPortalUserId: accepted.portalUserId,
      correlationId: "invitation-acceptance",
      resourceType: "Invitation",
    });
    await expect(context.feature.accept({
      correlationId: "invitation-replay",
      fullName: "Invited University Admin",
      idToken: "verified-firebase-id-token",
      token: rawToken,
    })).rejects.toMatchObject({ code: "INVALID_INVITATION" });

    const sessions = createSessionService({
      identityVerifier: context.identityVerifier,
      repository: context.persistence.sessions,
      tokens: webCryptoSessionTokens,
    });
    const session = await sessions.start({
      correlationId: "invitation-session",
      csrfCookieToken: "c".repeat(32),
      csrfToken: "c".repeat(32),
      idToken: "verified-firebase-id-token",
    });
    const actor = await sessions.require(session.sessionToken, "invitation-session-check");

    expect(actor).toMatchObject({
      email: invitedEmail,
      portalUserId: accepted.portalUserId,
      appointments: [{ role: "UNIVERSITY_ADMIN", universityId: context.university.id }],
    });
  });

  it("rejects a mismatched verified email, then rejects a revoked one-time token", async () => {
    const context = await createContext();
    const invitedEmail = `match-${randomUUID()}@unyon.test`;
    const invitation = await context.feature.invite(context.request({
      email: invitedEmail,
      universityId: context.university.id,
    }));
    const rawToken = new URL(context.sentLinks[0]!).hash.slice(1);

    context.setIdentity({
      authenticatedAt: new Date(),
      email: `other-${randomUUID()}@unyon.test`,
      emailVerified: true,
      firebaseUid: `firebase-${randomUUID()}`,
    });
    await expect(context.feature.accept({
      correlationId: "wrong-email",
      fullName: "Wrong Email",
      idToken: "verified-firebase-id-token",
      token: rawToken,
    })).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });
    await expect(prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }))
      .resolves.toMatchObject({ status: "PENDING" });

    await context.feature.revoke(context.request({ id: invitation.id }));
    await expect(context.feature.accept({
      correlationId: "revoked-invite",
      fullName: "Invited Admin",
      idToken: "verified-firebase-id-token",
      token: rawToken,
    })).rejects.toEqual(new AccessError("INVALID_INVITATION", "This invitation is invalid or expired"));
    await expect(prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }))
      .resolves.toMatchObject({ status: "REVOKED" });
  });

  it("rejects expired and archived-university invitations", async () => {
    const expiredContext = await createContext();
    const expired = await expiredContext.feature.invite(expiredContext.request({
      email: `expired-${randomUUID()}@unyon.test`,
      universityId: expiredContext.university.id,
    }));
    const expiredToken = new URL(expiredContext.sentLinks[0]!).hash.slice(1);
    await prisma.invitation.update({
      data: { expiresAt: new Date(Date.now() - 1000) },
      where: { id: expired.id },
    });
    await expect(expiredContext.feature.accept({
      correlationId: "expired-invite",
      fullName: "Expired Admin",
      idToken: "verified-firebase-id-token",
      token: expiredToken,
    })).rejects.toMatchObject({ code: "INVALID_INVITATION" });

    const archivedContext = await createContext();
    const archived = await archivedContext.feature.invite(archivedContext.request({
      email: `archived-${randomUUID()}@unyon.test`,
      universityId: archivedContext.university.id,
    }));
    const archivedToken = new URL(archivedContext.sentLinks[0]!).hash.slice(1);
    await prisma.memberUniversity.update({ data: { status: "ARCHIVED" }, where: { id: archivedContext.university.id } });
    await expect(archivedContext.feature.preview(archivedToken)).resolves.toBeNull();
    await expect(archivedContext.feature.accept({
      correlationId: "archived-invite",
      fullName: "Archived Admin",
      idToken: "verified-firebase-id-token",
      token: archivedToken,
    })).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    await expect(prisma.invitation.findUniqueOrThrow({ where: { id: archived.id } }))
      .resolves.toMatchObject({ status: "PENDING" });
  });

  it("links the existing matching Portal User and rejects duplicate pending invitations", async () => {
    const context = await createContext();
    const invitedEmail = `existing-${randomUUID()}@unyon.test`;
    const firebaseUid = `firebase-${randomUUID()}`;
    const existingUser = await prisma.portalUser.create({
      data: { email: invitedEmail, firebaseUid, fullName: "Existing Portal User" },
    });
    context.setIdentity({
      authenticatedAt: new Date(),
      email: invitedEmail,
      emailVerified: true,
      firebaseUid,
    });
    const invitation = await context.feature.invite(context.request({
      email: invitedEmail,
      universityId: context.university.id,
    }));
    await expect(context.feature.invite(context.request({
      email: invitedEmail,
      universityId: context.university.id,
    }))).rejects.toMatchObject({ code: "CONFLICT" });

    const rawToken = new URL(context.sentLinks[0]!).hash.slice(1);
    await expect(context.feature.accept({
      correlationId: "linked-account",
      fullName: "Ignored Replacement Name",
      idToken: "verified-firebase-id-token",
      token: rawToken,
    })).resolves.toEqual({ portalUserId: existingUser.id });
    await expect(prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }))
      .resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(prisma.portalUser.findUniqueOrThrow({ where: { id: existingUser.id } }))
      .resolves.toMatchObject({ fullName: "Existing Portal User" });
  });

  it("accepts independent invitations concurrently without reporting false account conflicts", async () => {
    const pending = [];
    for (let index = 0; index < 12; index += 1) {
      const context = await createContext();
      const email = `concurrent-${randomUUID()}@unyon.test`;
      context.setIdentity({ authenticatedAt: new Date(), email, emailVerified: true, firebaseUid: randomUUID() });
      await context.feature.invite(context.request({ email, universityId: context.university.id }));
      pending.push(context);
    }
    const results = await Promise.allSettled(pending.map((context) => context.feature.accept({
      correlationId: randomUUID(), fullName: "Concurrent Invitee", idToken: "verified-token", token: new URL(context.sentLinks[0]!).hash.slice(1),
    })));
    expect(results.filter(({ status }) => status === "rejected")).toEqual([]);
  });
});

async function createContext() {
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS "now"`;
  const university = await prisma.memberUniversity.create({
    data: { name: `Invitation University ${randomUUID()}`, slug: `invite-${randomUUID()}` },
  });
  const superAdminUser = await prisma.portalUser.create({
    data: {
      email: `super-admin-${randomUUID()}@unyon.test`,
      firebaseUid: `firebase-super-admin-${randomUUID()}`,
      fullName: "Invitation Test Super Admin",
    },
  });
  await prisma.appointment.create({
    data: {
      portalUserId: superAdminUser.id,
      role: "SUPER_ADMIN",
      startsAt: new Date(now.getTime() - 60_000),
    },
  });
  const sessionToken = webCryptoSessionTokens.create();
  const sessionTokenHash = await webCryptoSessionTokens.hash(sessionToken);
  await prisma.portalSession.create({
    data: {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      portalUserId: superAdminUser.id,
      tokenHash: sessionTokenHash,
    },
  });

  let identity = {
    authenticatedAt: new Date(),
    email: "invitee@unyon.test",
    emailVerified: true,
    firebaseUid: `firebase-invitee-${randomUUID()}`,
  };
  const identityVerifier: IdentityVerifier = {
    verifyIdToken: async () => identity,
  };
  const persistence = createAccessPersistence(prisma, (transaction) => ({
    universityAdminInvitations: new PrismaUniversityAdminInvitationRepository(transaction),
  }));
  const sentLinks: string[] = [];
  const feature = createUniversityAdminInvitationFeature({
    sessions: { hashSessionToken: async () => sessionTokenHash },
    transactions: persistence.transactions,
    acceptance: {
      accept: (input) => acceptUniversityAdminInvitation(prisma, input),
      preview: (tokenHash) => previewUniversityAdminInvitation(prisma, tokenHash),
    },
    identityVerifier,
    tokens: webCryptoSessionTokens,
    delivery: {
      send: async ({ invitationUrl }) => {
        sentLinks.push(invitationUrl);
      },
    },
    appOrigin: "https://portal.unyon.example",
  });
  const superAdmin: PortalActor = {
    appointments: [{ id: randomUUID(), role: "SUPER_ADMIN", universityId: null }],
    email: superAdminUser.email,
    firebaseUid: superAdminUser.firebaseUid,
    portalUserId: superAdminUser.id,
  };

  return {
    feature,
    identityVerifier,
    persistence,
    request(input: unknown) {
      return { correlationId: randomUUID(), input, sessionToken };
    },
    sentLinks,
    setIdentity(value: typeof identity) {
      identity = value;
    },
    superAdmin,
    university,
  };
}
