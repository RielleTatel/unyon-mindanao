export interface SecurePostgresConnectionOptions {
  connectionString: string;
  certificatePath?: string;
  ssl: {
    rejectUnauthorized: true;
    ca?: string;
  };
}

export function createSecurePostgresConnectionOptions(
  sourceUrl: string,
  caCertificate?: string,
): SecurePostgresConnectionOptions {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("SOURCE_DATABASE_URL must be a well-formed PostgreSQL connection URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("SOURCE_DATABASE_URL must be a PostgreSQL connection URL");
  }

  // Enforce verified TLS regardless of weaker sslmode/ssl query parameters.
  const certificatePath = url.searchParams.get("sslrootcert");
  for (const parameter of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    url.searchParams.delete(parameter);
  }

  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(caCertificate ? { ca: caCertificate } : {}),
    },
    ...(certificatePath ? { certificatePath } : {}),
  };
}
