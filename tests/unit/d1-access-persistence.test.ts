// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import { LocalD1Database } from "../fixtures/local-d1";

describe("D1 access persistence through its feature interfaces", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("bootstraps idempotently, starts a hashed session, and rechecks current authority", async () => {
    database = new LocalD1Database(["0001_access_foundation.sql"]);
    const persistence = createD1AccessPersistence(database as unknown as D1Database);
    const bootstrap = createSuperAdminBootstrap(persistence.superAdminBootstrap);
    const input = {
      correlationId: "bootstrap-correlation",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-1",
      fullName: "Portal Administrator",
    };

    const first = await bootstrap(input);
    const second = await bootstrap({ ...input, correlationId: "confirm-correlation" });
    expect(first.created).toBe(true);
    expect(second).toEqual({ ...first, created: false });

    const tokenHash = "b".repeat(64);
    const started = await persistence.sessions.start({
      correlationId: "session-correlation",
      identity: {
        authenticatedAt: new Date(),
        email: input.email,
        emailVerified: true,
        firebaseUid: input.firebaseUid,
      },
      maximumLifetimeSeconds: 60 * 60,
      tokenHash,
    });

    expect(started?.actor).toMatchObject({
      email: input.email,
      firebaseUid: input.firebaseUid,
      portalUserId: first.portalUserId,
      appointments: [{ role: "SUPER_ADMIN", universityId: null }],
    });
    await expect(persistence.sessions.resolve({ tokenHash, correlationId: "resolve" }))
      .resolves.toMatchObject({ portalUserId: first.portalUserId });

    await database.batch([
      database.prepare("UPDATE portal_users SET status = 'DISABLED' WHERE id = ?")
        .bind(first.portalUserId),
    ]);
    await expect(persistence.sessions.resolve({ tokenHash, correlationId: "resolve-disabled" }))
      .resolves.toBeNull();

    await expect(
      database.prepare("SELECT action FROM audit_logs ORDER BY occurred_at, action").all<string>(),
    ).resolves.toMatchObject({
      results: expect.arrayContaining([
        { action: "super_admin.bootstrapped" },
        { action: "super_admin.confirmed" },
        { action: "session.started" },
      ]),
    });
  });

  it("keeps session creation and its audit record atomic", async () => {
    database = new LocalD1Database(["0001_access_foundation.sql"]);
    const persistence = createD1AccessPersistence(database as unknown as D1Database);
    const bootstrapped = await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap-correlation",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-1",
      fullName: "Portal Administrator",
    });
    await database.batch([
      database.prepare(
        `CREATE TRIGGER reject_session_audit BEFORE INSERT ON audit_logs
         WHEN NEW.action = 'session.started'
         BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`,
      ),
    ]);

    await expect(
      persistence.sessions.start({
        correlationId: "session-correlation",
        identity: {
          authenticatedAt: new Date(),
          email: "admin@unyon.test",
          emailVerified: true,
          firebaseUid: "firebase-admin-1",
        },
        maximumLifetimeSeconds: 60 * 60,
        tokenHash: "c".repeat(64),
      }),
    ).rejects.toThrow(/audit unavailable/iu);

    await expect(
      database.prepare("SELECT COUNT(*) AS count FROM portal_sessions WHERE portal_user_id = ?")
        .bind(bootstrapped.portalUserId)
        .first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });
});
