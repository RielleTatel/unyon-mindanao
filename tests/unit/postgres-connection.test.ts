import { describe, expect, it } from "vitest";

import { createSecurePostgresConnectionOptions } from "../../scripts/lib/postgres-connection";

describe("read-only PostgreSQL export connection security", () => {
  it("forces verified TLS and strips connection-string options that could disable verification", () => {
    const options = createSecurePostgresConnectionOptions(
      "postgresql://user:local-test-secret@db.example.test:5432/portal?sslmode=disable&ssl=no-verify",
    );
    const url = new URL(options.connectionString);

    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("db.example.test");
    expect(url.port).toBe("5432");
    expect(url.pathname).toBe("/portal");
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("ssl")).toBe(false);
  });

  it("retains a supplied CA path for verified TLS configuration", () => {
    const options = createSecurePostgresConnectionOptions(
      "postgres://user:local-test-secret@db.example.test/portal?sslrootcert=%2Ftmp%2Ftest-ca.crt&sslmode=require",
    );

    expect(options.certificatePath).toBe("/tmp/test-ca.crt");
    expect(options.connectionString).not.toContain("sslrootcert");
    expect(options.connectionString).not.toContain("sslmode");
  });

  it("rejects non-PostgreSQL connection URLs", () => {
    expect(() => createSecurePostgresConnectionOptions("https://example.test/database"))
      .toThrow("SOURCE_DATABASE_URL must be a PostgreSQL connection URL");
  });
});
