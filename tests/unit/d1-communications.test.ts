// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createCommunicationsFeature,
  type CommunicationsRepository,
} from "@/features/communications/server";
import { D1CommunicationsRepository } from "@/features/communications/server/d1-communications-repository";
import { LocalD1Database } from "../fixtures/local-d1";

describe("D1 communications through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("saves, versions, publishes, audits, and reorders content atomically", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
    ]);
    const tokenHash = "d".repeat(64);
    const persistence = createD1AccessPersistence<{
      communications: CommunicationsRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      communications: new D1CommunicationsRepository(transaction),
    }));
    const bootstrap = await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-communications",
      fullName: "Communications Admin",
    });
    await persistence.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-communications",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash,
    });
    const feature = createCommunicationsFeature({
      sessions: { hashSessionToken: async () => tokenHash },
      transactions: persistence.transactions,
    });
    const sessionToken = "opaque-session-token";

    const draft = await feature.saveAnnouncement({
      correlationId: "save-announcement",
      sessionToken,
      input: { body: "First version", title: "Portal update" },
    });
    expect(draft).toMatchObject({ status: "DRAFT", version: 1 });

    const edited = await feature.saveAnnouncement({
      correlationId: "edit-announcement",
      sessionToken,
      input: {
        body: "Updated copy",
        id: draft.id,
        title: "Portal update revised",
        version: draft.version,
      },
    });
    expect(edited).toMatchObject({ body: "Updated copy", version: 2 });

    const published = await feature.transitionAnnouncement({
      correlationId: "publish-announcement",
      sessionToken,
      input: { id: draft.id, status: "PUBLISHED", version: edited.version },
    });
    expect(published).toMatchObject({ status: "PUBLISHED", version: 3 });
    expect(published.publishedAt).toEqual(expect.any(String));

    const shortcutA = await feature.saveShortcut({
      correlationId: "create-shortcut-a",
      sessionToken,
      input: {
        active: true,
        icon: null,
        label: "Student resources",
        url: "https://example.org/resources",
      },
    });
    const shortcutB = await feature.saveShortcut({
      correlationId: "create-shortcut-b",
      sessionToken,
      input: {
        active: true,
        icon: "book",
        label: "Scholarships",
        url: "https://example.org/scholarships",
      },
    });
    await feature.reorderShortcuts({
      correlationId: "reorder-shortcuts",
      sessionToken,
      input: { ids: [shortcutB.id, shortcutA.id] },
    });

    await expect(
      feature.listAnnouncements({ correlationId: "list", sessionToken, input: {} }),
    ).resolves.toMatchObject([
      { id: draft.id, status: "PUBLISHED", version: 3 },
    ]);
    await expect(
      feature.listShortcuts({ correlationId: "list-shortcuts", sessionToken, input: {} }),
    ).resolves.toMatchObject([
      { id: shortcutB.id, sortOrder: 0 },
      { id: shortcutA.id, sortOrder: 1 },
    ]);

    await expect(
      database.prepare(
        "SELECT action FROM audit_logs WHERE action LIKE 'announcement.%' OR action LIKE 'shortcut.%' OR action LIKE 'shortcuts.%' ORDER BY action",
      ).all<{ action: string }>(),
    ).resolves.toMatchObject({ results: expect.arrayContaining([
      { action: "announcement.saved" },
      { action: "announcement.transitioned" },
      { action: "shortcut.saved" },
      { action: "shortcuts.reordered" },
    ]) });
    expect(bootstrap.portalUserId).toBeTruthy();
  });
});
