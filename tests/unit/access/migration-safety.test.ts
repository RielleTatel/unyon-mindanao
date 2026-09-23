import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("access hardening migration", () => {
  it("wraps replacement constraints and triggers in one PostgreSQL transaction", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260916233000_harden_access_invariants/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(/\bBEGIN;[\s\S]*DROP INDEX[\s\S]*COMMIT;\s*$/u);
    expect(migration).toMatch(
      /\bBEGIN;[\s\S]*DROP TRIGGER[\s\S]*CREATE TRIGGER[\s\S]*COMMIT;/u,
    );
  });
});
