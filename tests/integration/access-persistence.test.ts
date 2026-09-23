import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createAccessPersistence,
  createProtectedOperationFactory,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local" });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    "TEST_DATABASE_URL must point to a dedicated database ending in _test",
  );
}

const prisma = createPrismaClient(testDatabaseUrl);

describe("access persistence", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("bootstraps exactly one active Super Admin appointment", async () => {
    const firebaseUid = `firebase-${randomUUID()}`;
    const bootstrap = createSuperAdminBootstrap(
      createAccessPersistence(prisma).superAdminBootstrap,
    );
    const input = {
      correlationId: randomUUID(),
      email: `${randomUUID()}@unyon.test`,
      firebaseUid,
      fullName: "Unyon Administrator",
    };

    const first = await bootstrap(input);
    const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS "now"
    `;
    await prisma.appointment.update({
      data: {
        endsAt: new Date(now.getTime() + 60_000),
        startsAt: new Date(now.getTime() - 60_000),
      },
      where: { id: first.appointmentId },
    });
    const second = await bootstrap({ ...input, correlationId: randomUUID() });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      appointmentId: first.appointmentId,
      created: false,
      portalUserId: first.portalUserId,
    });
    await expect(
      prisma.appointment.count({
        where: { portalUserId: first.portalUserId, role: "SUPER_ADMIN" },
      }),
    ).resolves.toBe(1);
  });

  it("rejects bootstrap when the identity has a scheduled Super Admin appointment", async () => {
    const portalUser = await prisma.portalUser.create({
      data: {
        email: `${randomUUID()}@unyon.test`,
        firebaseUid: `firebase-${randomUUID()}`,
        fullName: "Scheduled Administrator",
      },
    });
    const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS "now"
    `;
    await prisma.appointment.create({
      data: {
        portalUserId: portalUser.id,
        role: "SUPER_ADMIN",
        startsAt: new Date(now.getTime() + 60_000),
      },
    });

    await expect(
      createSuperAdminBootstrap(
        createAccessPersistence(prisma).superAdminBootstrap,
      )({
        correlationId: randomUUID(),
        email: portalUser.email,
        firebaseUid: portalUser.firebaseUid,
        fullName: portalUser.fullName,
      }),
    ).rejects.toThrow(/scheduled Super Admin appointment/iu);
  });

  it("creates hashed sessions and rechecks current appointments", async () => {
    const firebaseUid = `firebase-${randomUUID()}`;
    const email = `${randomUUID()}@unyon.test`;
    const bootstrapped = await createSuperAdminBootstrap(
      createAccessPersistence(prisma).superAdminBootstrap,
    )({
      correlationId: randomUUID(),
      email,
      firebaseUid,
      fullName: "Session Administrator",
    });
    const repository = createAccessPersistence(prisma).sessions;
    const tokenHash = randomUUID().replaceAll("-", "").repeat(2);

    const started = await repository.start({
      correlationId: randomUUID(),
      identity: {
        authenticatedAt: new Date(),
        email,
        emailVerified: true,
        firebaseUid,
      },
      maximumLifetimeSeconds: 60 * 60 * 24 * 5,
      tokenHash,
    });

    expect(started?.actor.appointments).toEqual([
      expect.objectContaining({ role: "SUPER_ADMIN", universityId: null }),
    ]);
    await expect(
      repository.resolve({ correlationId: randomUUID(), tokenHash }),
    ).resolves.toMatchObject({ portalUserId: bootstrapped.portalUserId });

    await prisma.portalUser.update({
      data: { status: "DISABLED" },
      where: { id: bootstrapped.portalUserId },
    });
    await expect(
      repository.resolve({ correlationId: randomUUID(), tokenHash }),
    ).resolves.toBeNull();
  });

  it("resolves current authority, executes, and redacts audit data atomically", async () => {
    const firebaseUid = `firebase-${randomUUID()}`;
    const email = `${randomUUID()}@unyon.test`;
    const bootstrapped = await createSuperAdminBootstrap(
      createAccessPersistence(prisma).superAdminBootstrap,
    )({
      correlationId: randomUUID(),
      email,
      firebaseUid,
      fullName: "Atomic Administrator",
    });
    const tokenHash = randomUUID().replaceAll("-", "").repeat(2);
    await createAccessPersistence(prisma).sessions.start({
      correlationId: randomUUID(),
      identity: {
        authenticatedAt: new Date(),
        email,
        emailVerified: true,
        firebaseUid,
      },
      maximumLifetimeSeconds: 60 * 60,
      tokenHash,
    });
    const transactions = createAccessPersistence(prisma, (transaction) => ({
      findPortalUser: async (portalUserId: string) =>
        transaction.portalUser.findUnique({
          select: { id: true },
          where: { id: portalUserId },
        }),
      renamePortalUser: async (portalUserId: string, fullName: string) =>
        transaction.portalUser.update({
          data: { fullName },
          where: { id: portalUserId },
        }),
    })).transactions;
    const factory = createProtectedOperationFactory({
      sessions: { hashSessionToken: async () => tokenHash },
      transactions,
    });
    const operation = factory.mutation({
      action: "portal.atomic_test",
      intent: "portal.atomic_test",
      input: z.object({ fullName: z.string() }),
      resolveSubject: async ({ actor, transaction }) => {
        const user = await transaction.capabilities.findPortalUser(
          actor.portalUserId,
        );
        return user ? { id: user.id, kind: "PortalUser" } : null;
      },
      authorize: ({ actor }) =>
        actor.appointments.some(({ role }) => role === "SUPER_ADMIN"),
      execute: async ({ subject, transaction }, input) => {
        await transaction.capabilities.renamePortalUser(
          subject.id,
          input.fullName,
        );
        return subject.id;
      },
      auditMetadata: () => ({
        dateOfBirth: "2000-01-01",
        nested: { dob: "2000-01-01", safe: "visible" },
      }),
    });

    await expect(
      operation({
        correlationId: randomUUID(),
        input: { fullName: "Committed Name" },
        sessionToken: "raw-token",
      }),
    ).resolves.toBe(bootstrapped.portalUserId);
    await expect(
      prisma.portalUser.findUniqueOrThrow({
        select: { fullName: true },
        where: { id: bootstrapped.portalUserId },
      }),
    ).resolves.toEqual({ fullName: "Committed Name" });
    await expect(
      prisma.auditLog.findFirstOrThrow({
        orderBy: { occurredAt: "desc" },
        where: { action: "portal.atomic_test" },
      }),
    ).resolves.toMatchObject({ metadata: { nested: { safe: "visible" } } });

    const rollbackOperation = factory.mutation({
      action: `portal.${"x".repeat(120)}`,
      intent: "portal.atomic_test",
      input: z.object({ fullName: z.string() }),
      resolveSubject: async ({ actor, transaction }) => {
        const user = await transaction.capabilities.findPortalUser(
          actor.portalUserId,
        );
        return user ? { id: user.id, kind: "PortalUser" } : null;
      },
      authorize: () => true,
      execute: async ({ subject, transaction }, input) => {
        await transaction.capabilities.renamePortalUser(
          subject.id,
          input.fullName,
        );
        return subject.id;
      },
      auditMetadata: () => ({ reason: "force audit constraint failure" }),
    });

    await expect(
      rollbackOperation({
        correlationId: randomUUID(),
        input: { fullName: "Rolled Back Name" },
        sessionToken: "raw-token",
      }),
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    await expect(
      prisma.portalUser.findUniqueOrThrow({
        select: { fullName: true },
        where: { id: bootstrapped.portalUserId },
      }),
    ).resolves.toEqual({ fullName: "Committed Name" });

    await prisma.portalUser.update({
      data: { status: "DISABLED" },
      where: { id: bootstrapped.portalUserId },
    });
    await expect(
      operation({
        correlationId: randomUUID(),
        input: { fullName: "Denied Name" },
        sessionToken: "raw-token",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("enforces append-only audit rows in PostgreSQL", async () => {
    await expect(
      prisma.auditLog.deleteMany(),
    ).rejects.toThrow(/audit logs are append-only/iu);
    await expect(
      prisma.auditLog.updateMany({ data: { action: "tampered" } }),
    ).rejects.toThrow(/audit logs are append-only/iu);
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"'),
    ).rejects.toThrow(/audit logs are append-only/iu);
  });

  it("rejects overlapping finite appointments in the same scope", async () => {
    const bootstrapped = await createSuperAdminBootstrap(
      createAccessPersistence(prisma).superAdminBootstrap,
    )({
      correlationId: randomUUID(),
      email: `${randomUUID()}@unyon.test`,
      firebaseUid: `firebase-${randomUUID()}`,
      fullName: "Appointment Administrator",
    });
    const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS "now"
    `;

    await expect(
      prisma.appointment.create({
        data: {
          endsAt: new Date(now.getTime() + 120_000),
          portalUserId: bootstrapped.portalUserId,
          role: "SUPER_ADMIN",
          startsAt: new Date(now.getTime() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});
