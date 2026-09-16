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

  return {
    appEnvironment: environment,
    appOrigin: origin.origin,
  };
}
