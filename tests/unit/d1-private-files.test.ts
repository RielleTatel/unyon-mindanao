// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import { createPrivateFileFeature } from "@/features/private-files/server/private-files";
import { D1PrivateFileRepository } from "@/features/private-files/server/d1-private-file-repository";
import type { PrivateObjectStore } from "@/platform/r2/contracts";
import { LocalD1Database } from "../fixtures/local-d1";

const tokenHash = "b".repeat(64);

describe("D1 private files through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("reserves, uploads, commits, and authorizes verified private objects", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
    ]);
    const persistence = createD1AccessPersistence<{ files: D1PrivateFileRepository }>(
      database as unknown as D1Database,
      (transaction) => ({ files: new D1PrivateFileRepository(transaction) }),
    );
    const admin = await createSuperAdminBootstrap(persistence.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-files",
      fullName: "Files Admin",
    });
    await persistence.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-files",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash,
    });
    const objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();
    const store: PrivateObjectStore = {
      get: async (key) => objects.get(key) ?? null,
      putIfAbsent: async (key, bytes, mimeType) => {
        if (objects.has(key)) return false;
        objects.set(key, { bytes, mimeType });
        return true;
      },
      delete: async (key) => { objects.delete(key); },
    };
    const feature = createPrivateFileFeature({
      sessions: { hashSessionToken: async () => tokenHash },
      store,
      transactions: persistence.transactions,
    });
    const request = {
      correlationId: "profile-image",
      sessionToken: "files-session-token",
    };
    const reserved = await feature.reserve({
      ...request,
      input: {
        purpose: "PROFILE_IMAGE",
        resourceId: admin.portalUserId,
        mimeType: "image/png",
        size: 8,
      },
    });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    await feature.upload({ ...request, input: { id: reserved.objectId, bytes, mimeType: "image/png" } });
    await expect(feature.commit({ ...request, input: { id: reserved.objectId } }))
      .resolves.toEqual({ available: true });
    const link = await feature.authorizeDownload({ ...request, input: { id: reserved.objectId } });
    const downloadUrl = new URL(link.url, "https://portal.test");
    await expect(feature.download({
      ...request,
      input: {
        id: reserved.objectId,
        expires: Number(downloadUrl.searchParams.get("expires")),
        signature: downloadUrl.searchParams.get("signature"),
      },
    })).resolves.toMatchObject({ bytes, mimeType: "image/png" });
    await expect(database.prepare(
      "SELECT status, sha256 FROM stored_objects WHERE id = ?",
    ).bind(reserved.objectId).first<{ status: string; sha256: string }>())
      .resolves.toMatchObject({ status: "AVAILABLE", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });
});
