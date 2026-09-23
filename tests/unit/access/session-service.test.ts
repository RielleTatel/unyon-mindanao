import { describe, expect, it, vi } from "vitest";

import {
  AccessError,
  createSessionService,
  type PortalActor,
  type SessionRepository,
} from "@/features/access/server";

const actor: PortalActor = {
  portalUserId: "user-1",
  firebaseUid: "firebase-1",
  email: "admin@unyon.test",
  appointments: [
    {
      id: "appointment-1",
      role: "SUPER_ADMIN",
      universityId: null,
    },
  ],
};

function createRepository(
  overrides: Partial<SessionRepository> = {},
): SessionRepository {
  return {
    start: vi.fn(async () => ({
      actor,
      expiresAt: new Date("2026-09-21T00:00:00.000Z"),
    })),
    resolve: vi.fn(async () => actor),
    end: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createService(repository = createRepository()) {
  return {
    repository,
    service: createSessionService({
      identityVerifier: {
        verifyIdToken: vi.fn(async () => ({
          firebaseUid: "firebase-1",
          email: "admin@unyon.test",
          emailVerified: true,
          authenticatedAt: new Date("2026-09-16T00:00:00.000Z"),
        })),
      },
      repository,
      tokens: {
        create: vi.fn(() => "raw-session-token"),
        hash: vi.fn(async (value: string) => `hash:${value}`),
      },
      now: () => new Date("2026-09-16T00:04:00.000Z"),
    }),
  };
}

describe("session service", () => {
  it("starts a five-day portal session for a verified, recently authenticated identity", async () => {
    const { repository, service } = createService();

    const result = await service.start({
      idToken: "firebase-token",
      csrfToken: "csrf-token-0123456789abcdef",
      csrfCookieToken: "csrf-token-0123456789abcdef",
      correlationId: "request-1",
    });

    expect(result).toEqual({
      actor,
      expiresAt: new Date("2026-09-21T00:00:00.000Z"),
      sessionToken: "raw-session-token",
    });
    expect(repository.start).toHaveBeenCalledWith({
      correlationId: "request-1",
      identity: expect.objectContaining({ firebaseUid: "firebase-1" }),
      maximumLifetimeSeconds: 60 * 60 * 24 * 5,
      tokenHash: "hash:raw-session-token",
    });
    expect(repository.start).not.toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "raw-session-token" }),
    );
  });

  it("rejects CSRF mismatch, unverified email, and stale Firebase authentication", async () => {
    const { service } = createService();

    await expect(
      service.start({
        idToken: "firebase-token",
        csrfToken: "wrong-token-0123456789abcdef",
        csrfCookieToken: "expected-token-0123456789abcdef",
        correlationId: "request-2",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    const unverified = createSessionService({
      identityVerifier: {
        verifyIdToken: vi.fn(async () => ({
          firebaseUid: "firebase-1",
          email: "admin@unyon.test",
          emailVerified: false,
          authenticatedAt: new Date("2026-09-16T00:00:00.000Z"),
        })),
      },
      repository: createRepository(),
      tokens: {
        create: () => "token",
        hash: async (value) => value,
      },
      now: () => new Date("2026-09-16T00:04:00.000Z"),
    });

    await expect(
      unverified.start({
        idToken: "firebase-token",
        csrfToken: "csrf-token-0123456789abcdef",
        csrfCookieToken: "csrf-token-0123456789abcdef",
        correlationId: "request-3",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    const stale = createSessionService({
      identityVerifier: {
        verifyIdToken: vi.fn(async () => ({
          firebaseUid: "firebase-1",
          email: "admin@unyon.test",
          emailVerified: true,
          authenticatedAt: new Date("2026-09-15T23:00:00.000Z"),
        })),
      },
      repository: createRepository(),
      tokens: {
        create: () => "token",
        hash: async (value) => value,
      },
      now: () => new Date("2026-09-16T00:04:00.000Z"),
    });

    await expect(
      stale.start({
        idToken: "firebase-token",
        csrfToken: "csrf-token-0123456789abcdef",
        csrfCookieToken: "csrf-token-0123456789abcdef",
        correlationId: "request-4",
      }),
    ).rejects.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });
  });

  it("denies unknown or deactivated users without exposing the reason", async () => {
    const repository = createRepository({ start: vi.fn(async () => null) });
    const { service } = createService(repository);

    await expect(
      service.start({
        idToken: "firebase-token",
        csrfToken: "csrf-token-0123456789abcdef",
        csrfCookieToken: "csrf-token-0123456789abcdef",
        correlationId: "request-5",
      }),
    ).rejects.toEqual(
      new AccessError("AUTHENTICATION_REQUIRED", "Authentication required"),
    );
  });

  it("rechecks current access on every protected request and revokes on sign-out", async () => {
    const repository = createRepository({
      resolve: vi
        .fn<SessionRepository["resolve"]>()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(null),
    });
    const { service } = createService(repository);

    await expect(service.require("raw-session-token", "request-6")).resolves.toEqual(
      actor,
    );
    await expect(
      service.require("raw-session-token", "request-7"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    await service.end("raw-session-token", "request-8");
    expect(repository.end).toHaveBeenCalledWith({
      correlationId: "request-8",
      tokenHash: "hash:raw-session-token",
    });
  });
});
