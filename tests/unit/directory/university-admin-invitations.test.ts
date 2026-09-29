import { describe, expect, it, vi } from "vitest";

import {
  type AuditRecord,
  type PortalActor,
  type TransactionRunner,
} from "@/features/access/server";
import {
  createUniversityAdminInvitationFeature,
  type InvitationAcceptanceRepository,
  type UniversityAdminInvitationRepository,
} from "@/features/directory/server";
import type { UniversityAdminInvitationRecord } from "@/features/directory/contracts";

const occurredAt = new Date("2026-09-21T00:00:00.000Z");
const universityId = "00000000-0000-4000-8000-000000000002";
const superAdmin: PortalActor = {
  appointments: [{ id: "appointment-1", role: "SUPER_ADMIN", universityId: null }],
  email: "admin@unyon.test",
  firebaseUid: "firebase-admin",
  portalUserId: "00000000-0000-4000-8000-000000000001",
};

function createFeature(options: { role?: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE" } = {}) {
  const records = new Map<string, UniversityAdminInvitationRecord>();
  const audits: AuditRecord[] = [];
  const repository: UniversityAdminInvitationRepository = {
    listActiveUniversities: vi.fn(async () => []),
    listPending: vi.fn(async () => [...records.values()].filter(({ status }) => status === "PENDING")),
    getActiveUniversity: vi.fn(async (id) =>
      id === universityId ? { id, name: "University of Mindanao" } : null,
    ),
    getPending: vi.fn(async (id) => records.get(id) ?? null),
    createPending: vi.fn(async (input) => {
      const record: UniversityAdminInvitationRecord = {
        id: input.id,
        email: input.email,
        role: input.role,
        status: "PENDING",
        universityId: input.universityId,
        universityName: "University of Mindanao",
        expiresAt: input.expiresAt.toISOString(),
        createdAt: occurredAt.toISOString(),
      };
      records.set(record.id, record);
      return record;
    }),
    revokePending: vi.fn(async (id) => {
      const existing = records.get(id);

      if (!existing || existing.status !== "PENDING") {
        return null;
      }

      const revoked = { ...existing, status: "REVOKED" as const };
      records.set(id, revoked);
      return revoked;
    }),
  };
  const acceptance: InvitationAcceptanceRepository = {
    preview: vi.fn(async () => null),
    accept: vi.fn(async () => ({ portalUserId: "portal-user-1" })),
  };
  const transactions: TransactionRunner<{
    universityAdminInvitations: UniversityAdminInvitationRepository;
  }> = {
    run: async (_request, work) =>
      work(
        {
          capabilities: { universityAdminInvitations: repository },
          occurredAt,
          appendAudit: async (record) => {
            audits.push(record);
          },
        },
        options.role === "REPRESENTATIVE"
          ? { ...superAdmin, appointments: [{ id: "rep", role: "REPRESENTATIVE", universityId }] }
          : options.role === "UNIVERSITY_ADMIN"
            ? { ...superAdmin, appointments: [{ id: "university-admin", role: "UNIVERSITY_ADMIN", universityId }] }
            : superAdmin,
      ),
  };
  const tokens = {
    create: () => "x".repeat(43),
    hash: async () => "a".repeat(64),
  };
  const feature = createUniversityAdminInvitationFeature({
    sessions: { hashSessionToken: async () => "session-hash" },
    transactions,
    acceptance,
    identityVerifier: {
      verifyIdToken: async () => ({
        authenticatedAt: occurredAt,
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-invitee",
      }),
    },
    tokens,
    appOrigin: "https://portal.unyon.example",
  });

  return { acceptance, audits, feature, records, repository };
}

const request = (input: unknown) => ({
  correlationId: "request-1",
  input,
  sessionToken: "session-token",
});

describe("University Admin invitation feature", () => {
  it("lets Super Admins manage Representative invitations across Member Universities", async () => {
    const { feature, repository } = createFeature();
    const invitation = await feature.inviteRepresentative(request({ email: "rep@university.edu", universityId }));
    await feature.listPendingRepresentatives(request({}));
    expect(repository.listPending).toHaveBeenCalledWith(occurredAt, "REPRESENTATIVE", undefined);
    await feature.managedUniversities(request({}));
    expect(repository.listActiveUniversities).toHaveBeenCalled();
    await expect(feature.revokeRepresentative(request({ id: invitation.invitation.id }))).resolves.toMatchObject({ status: "REVOKED" });
  });
  it("returns a private seven-day link to the authorized inviter without persisting the token", async () => {
    const { audits, feature, records, repository } = createFeature();
    const result = await feature.invite(
      request({ email: "  Admin@University.EDU ", universityId }),
    );

    expect(result).toMatchObject({
      invitation: {
        email: "admin@university.edu",
        role: "UNIVERSITY_ADMIN",
        status: "PENDING",
        universityName: "University of Mindanao",
      },
      invitationUrl: `https://portal.unyon.example/accept-invitation#${"x".repeat(43)}`,
    });
    expect(Date.parse(result.invitation.expiresAt) - Date.parse(result.invitation.createdAt)).toBe(7 * 24 * 60 * 60 * 1000);
    expect([...records.values()]).toHaveLength(1);
    expect(audits).toEqual([
      expect.objectContaining({
        action: "university_admin_invitation.created",
        resourceId: result.invitation.id,
        resourceType: "Invitation",
        metadata: { role: "UNIVERSITY_ADMIN", universityId },
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain("x".repeat(43));
    expect(repository.createPending).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: "a".repeat(64) }));
    expect(JSON.stringify([...records.values()])).not.toContain("x".repeat(43));
    expect(JSON.stringify(await feature.listPending(request({})))).not.toContain("x".repeat(43));
  });

  it("denies non-Super Admins without creating an invitation", async () => {
    const { feature, repository } = createFeature({ role: "REPRESENTATIVE" });

    await expect(
      feature.invite(request({ email: "admin@university.edu", universityId })),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(repository.createPending).not.toHaveBeenCalled();
  });

  it("lets a University Admin invite a Representative only for its Member University", async () => {
    const { audits, feature, repository } = createFeature({ role: "UNIVERSITY_ADMIN" });
    const issued = await feature.inviteRepresentative(request({ email: " rep@university.edu ", universityId }));

    expect(issued.invitation).toMatchObject({ email: "rep@university.edu", role: "REPRESENTATIVE", status: "PENDING" });
    expect(issued.invitationUrl).toBe(`https://portal.unyon.example/accept-invitation#${"x".repeat(43)}`);
    expect(repository.createPending).toHaveBeenCalledWith(expect.objectContaining({ role: "REPRESENTATIVE", universityId }));
    expect(audits[0]).toMatchObject({
      action: "representative_invitation.created",
      metadata: { role: "REPRESENTATIVE", universityId },
    });

    const wrongUniversity = "00000000-0000-4000-8000-000000000099";
    await expect(feature.inviteRepresentative(request({ email: "other@university.edu", universityId: wrongUniversity })))
      .rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });

  it("issues a usable link without configuring an email provider", async () => {
    const { audits, feature, records } = createFeature();

    const result = await feature.invite(request({ email: "admin@university.edu", universityId }));

    expect(result.invitationUrl).toBe(`https://portal.unyon.example/accept-invitation#${"x".repeat(43)}`);
    expect([...records.values()]).toMatchObject([{ status: "PENDING" }]);
    expect(audits.map(({ action }) => action)).toEqual(["university_admin_invitation.created"]);
  });

  it("checks verified Firebase identity before accepting a bearer invitation", async () => {
    const { acceptance, feature } = createFeature();

    await expect(
      feature.accept({
        token: "x".repeat(43),
        idToken: "firebase-id-token",
        fullName: "Invited Admin",
        correlationId: "request-1",
      }),
    ).resolves.toEqual({ portalUserId: "portal-user-1" });
    expect(acceptance.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "request-1",
        fullName: "Invited Admin",
        identity: {
          email: "admin@unyon.test",
          emailVerified: true,
          firebaseUid: "firebase-invitee",
        },
      }),
    );
  });

  it("rejects an unverified identity without consuming the invitation", async () => {
    const { acceptance } = createFeature();
    const rejectingFeature = createUniversityAdminInvitationFeature({
      sessions: { hashSessionToken: async () => "session-hash" },
      transactions: {
        run: async () => {
          throw new Error("Unexpected protected operation");
        },
      },
      acceptance,
      identityVerifier: {
        verifyIdToken: async () => ({
          authenticatedAt: occurredAt,
          email: "admin@unyon.test",
          emailVerified: false,
          firebaseUid: "firebase-invitee",
        }),
      },
      tokens: { create: () => "x".repeat(43), hash: async () => "a".repeat(64) },
      appOrigin: "https://portal.unyon.example",
    });

    await expect(
      rejectingFeature.accept({
        token: "x".repeat(43),
        idToken: "firebase-id-token",
        fullName: "Invited Admin",
        correlationId: "request-1",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(acceptance.accept).not.toHaveBeenCalled();
  });
});
