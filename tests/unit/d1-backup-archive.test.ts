// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  decryptD1BackupArchive,
  encryptD1BackupArchive,
  encryptMigrationArchive,
} from "../../scripts/lib/d1-migration-archive";

describe("encrypted D1 backup archives", () => {
  it("round-trips an encrypted D1 snapshot without storing its contents in plaintext", () => {
    const snapshot = { tables: { portal_users: [{ email: "private.person@example.test" }] } };
    const key = Buffer.alloc(32, 4);
    const archive = encryptD1BackupArchive(snapshot, key);

    expect(archive.includes(Buffer.from("private.person@example.test"))).toBe(false);
    expect(decryptD1BackupArchive(archive, key)).toEqual(snapshot);
  });

  it("does not accept a PostgreSQL migration archive as a D1 backup", () => {
    const migration = encryptMigrationArchive({ formatVersion: 1 }, Buffer.alloc(32, 4));
    expect(() => decryptD1BackupArchive(migration, Buffer.alloc(32, 4))).toThrow();
  });
});
