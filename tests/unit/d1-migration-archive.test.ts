// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  decryptMigrationArchive,
  encryptMigrationArchive,
} from "../../scripts/lib/d1-migration-archive";

describe("encrypted PostgreSQL-to-D1 migration archives", () => {
  it("round-trips a snapshot without leaving sensitive values in plaintext", () => {
    const key = Buffer.alloc(32, 7);
    const snapshot = {
      formatVersion: 1,
      createdAt: "2026-09-25T12:00:00.000Z",
      tables: { portal_users: [{ email: "private.person@example.test" }] },
    };

    const archive = encryptMigrationArchive(snapshot, key);

    expect(archive.includes(Buffer.from("private.person@example.test"))).toBe(false);
    expect(decryptMigrationArchive(archive, key)).toEqual(snapshot);
  });

  it("rejects a wrong key and a modified archive", () => {
    const archive = encryptMigrationArchive({ formatVersion: 1 }, Buffer.alloc(32, 7));

    expect(() => decryptMigrationArchive(archive, Buffer.alloc(32, 8))).toThrow();
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptMigrationArchive(tampered, Buffer.alloc(32, 7))).toThrow();
  });
});
