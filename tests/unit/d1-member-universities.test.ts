// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createMemberUniversityFeature,
  type DirectoryCapabilities,
} from "@/features/directory/server";
import { D1MemberUniversityRepository } from "@/features/directory/server/d1-member-university-repository";
import { LocalD1Database } from "../fixtures/local-d1";

describe("D1 Member University persistence through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("creates, updates, archives, restores, and rejects normalized duplicates", async () => {
    database = new LocalD1Database();
    const tokenHash = "e".repeat(64);
    const persistence = createD1AccessPersistence<DirectoryCapabilities>(
      database as unknown as D1Database,
      (transaction) => ({
        memberUniversities: new D1MemberUniversityRepository(transaction),
      }),
    );
    await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-directory",
      fullName: "Directory Admin",
    });
    await persistence.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-directory",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash,
    });
    const feature = createMemberUniversityFeature({
      sessions: { hashSessionToken: async () => tokenHash },
      transactions: persistence.transactions,
    });
    const sessionToken = "admin-session";

    const created = await feature.create({
      correlationId: "create-university",
      sessionToken,
      input: { name: "  University   of Mindanao ", slug: "", description: "  Student orgs  " },
    });
    expect(created).toMatchObject({
      name: "University of Mindanao",
      slug: "university-of-mindanao",
      description: "Student orgs",
      status: "ACTIVE",
    });

    const updated = await feature.update({
      correlationId: "update-university",
      sessionToken,
      input: { id: created.id, name: "University of Mindanao (Main)", description: "" },
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: "University of Mindanao (Main)",
      slug: "university-of-mindanao-main",
      description: null,
    });

    await feature.archive({
      correlationId: "archive-university",
      sessionToken,
      input: { id: created.id },
    });
    await expect(
      feature.list({ correlationId: "list-active", sessionToken, input: {} }),
    ).resolves.toEqual([]);
    await feature.restore({
      correlationId: "restore-university",
      sessionToken,
      input: { id: created.id },
    });
    await expect(
      feature.list({ correlationId: "list-active-again", sessionToken, input: {} }),
    ).resolves.toMatchObject([{ id: created.id, status: "ACTIVE" }]);

    await expect(
      feature.create({
        correlationId: "create-duplicate",
        sessionToken,
        input: { name: "university of mindanao (main)", description: "Other campus" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
