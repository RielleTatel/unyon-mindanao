import { z } from "zod";

const appEnvironmentSchema = z.enum(["local", "preview", "production"]);
const originSchema = z.url();

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export interface PortalEnvironment {
  appEnvironment: AppEnvironment;
  appOrigin: string;
}

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

export function validateEnvironment(
  appEnvironment: AppEnvironment,
  source: Readonly<Record<string, string | undefined>>,
): PortalEnvironment {
  const environment = appEnvironmentSchema.parse(appEnvironment);
  const rawOrigin =
    source.NEXT_PUBLIC_APP_ORIGIN ??
    (environment === "local" ? "http://localhost:3000" : undefined);

  if (!rawOrigin) {
    throw new EnvironmentConfigurationError(
      `NEXT_PUBLIC_APP_ORIGIN is required in ${environment}`,
    );
  }

  const parsedOrigin = originSchema.safeParse(rawOrigin);

  if (!parsedOrigin.success) {
    throw new EnvironmentConfigurationError(
      "NEXT_PUBLIC_APP_ORIGIN must be an absolute URL",
    );
  }

  const origin = new URL(parsedOrigin.data);

  if (environment !== "local" && origin.protocol !== "https:") {
    throw new EnvironmentConfigurationError(
      "NEXT_PUBLIC_APP_ORIGIN must use HTTPS outside local development",
    );
  }

  if (
    environment !== "local" &&
    (source.FIREBASE_AUTH_EMULATOR_HOST ||
      source.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST)
  ) {
    throw new EnvironmentConfigurationError(
      "Firebase Auth Emulator settings are allowed only in local development",
    );
  }

  if (environment !== "local") {
    validateServiceConfiguration(source);
  }

  if (source.APP_ENV && source.APP_ENV !== environment) {
    throw new EnvironmentConfigurationError(
      `APP_ENV must match the requested ${environment} environment`,
    );
  }

  return {
    appEnvironment: environment,
    appOrigin: origin.origin,
  };
}

function validateServiceConfiguration(
  source: Readonly<Record<string, string | undefined>>,
) {
  const required = [
    "DATABASE_URL",
    "FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "RESEND_API_KEY",
    "INVITATION_FROM_EMAIL",
  ] as const;

  for (const key of required) {
    if (!source[key]?.trim()) {
      throw new EnvironmentConfigurationError(`${key} is required`);
    }
  }

  let databaseUrl: URL;

  try {
    databaseUrl = new URL(source.DATABASE_URL as string);
  } catch {
    throw new EnvironmentConfigurationError(
      "DATABASE_URL must be an absolute PostgreSQL URL",
    );
  }

  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    isLocalDatabaseHost(databaseUrl.hostname)
  ) {
    throw new EnvironmentConfigurationError(
      "DATABASE_URL must use a non-local PostgreSQL service",
    );
  }

  if (source.FIREBASE_PROJECT_ID !== source.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new EnvironmentConfigurationError(
      "Firebase server and browser project IDs must match",
    );
  }

  if (!z.email().safeParse(source.INVITATION_FROM_EMAIL).success) {
    throw new EnvironmentConfigurationError(
      "INVITATION_FROM_EMAIL must be a valid email address",
    );
  }

  if (
    source.NEXT_PUBLIC_FIREBASE_API_KEY === "demo-api-key" ||
    source.FIREBASE_PROJECT_ID?.endsWith("-local")
  ) {
    throw new EnvironmentConfigurationError(
      "Local Firebase placeholders are not allowed outside local development",
    );
  }
}

function isLocalDatabaseHost(rawHostname: string) {
  const hostname = rawHostname
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
    .toLowerCase();

  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.") ||
    hostname === "::" ||
    hostname === "::1"
  );
}
