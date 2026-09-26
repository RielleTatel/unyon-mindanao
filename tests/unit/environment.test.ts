import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  validateEnvironment,
} from "@/shared/config/environment";

describe("environment validation", () => {
  const productionServices = {
    DATABASE_URL: "postgresql://portal:secret@db.example.test/unyon",
    FIREBASE_PROJECT_ID: "unyon-production",
    NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-browser-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "unyon-production.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "unyon-production",
    RESEND_API_KEY: "re_test_key",
    INVITATION_FROM_EMAIL: "portal@unyon.example",
  };

  it("uses the local portal origin only in local development", () => {
    expect(validateEnvironment("local", {})).toEqual({
      appEnvironment: "local",
      appOrigin: "http://localhost:3000",
    });
  });

  it.each(["preview", "production"] as const)(
    "requires an HTTPS portal origin in %s",
    (appEnvironment) => {
      expect(() => validateEnvironment(appEnvironment, {})).toThrow(
        EnvironmentConfigurationError,
      );
      expect(() =>
        validateEnvironment(appEnvironment, {
          NEXT_PUBLIC_APP_ORIGIN: "http://portal.example.test",
          ...productionServices,
        }),
      ).toThrow("NEXT_PUBLIC_APP_ORIGIN must use HTTPS");
    },
  );

  it("returns only values intended for the portal runtime", () => {
    expect(
      validateEnvironment("production", {
        NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
        ...productionServices,
      }),
    ).toEqual({
      appEnvironment: "production",
      appOrigin: "https://portal.unyon.example",
    });
  });

  it("allows preview without invitation email while keeping production strict", () => {
    const services = {
      DATABASE_URL: productionServices.DATABASE_URL,
      FIREBASE_PROJECT_ID: productionServices.FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_API_KEY:
        productionServices.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
        productionServices.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID:
        productionServices.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    };

    expect(
      validateEnvironment("preview", {
        ...services,
        NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
      }),
    ).toEqual({
      appEnvironment: "preview",
      appOrigin: "https://preview.unyon.example",
    });

    expect(() =>
      validateEnvironment("production", {
        ...services,
        NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
      }),
    ).toThrow("RESEND_API_KEY is required");
  });

  it("requires preview invitation email settings to be provided as a valid pair", () => {
    expect(() =>
      validateEnvironment("preview", {
        ...productionServices,
        NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
        INVITATION_FROM_EMAIL: undefined,
      }),
    ).toThrow("must be configured together");

    expect(() =>
      validateEnvironment("preview", {
        ...productionServices,
        NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
        INVITATION_FROM_EMAIL: "not-an-email",
      }),
    ).toThrow("must be a valid email address");
  });

  it("rejects emulator settings outside local development", () => {
    expect(() =>
      validateEnvironment("production", {
        APP_ENV: "production",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
        ...productionServices,
      }),
    ).toThrow("allowed only in local development");
  });

  it("rejects a mismatched explicit application environment", () => {
    expect(() =>
      validateEnvironment("preview", {
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
        ...productionServices,
      }),
    ).toThrow("APP_ENV must match");
  });

  it("requires non-local PostgreSQL and matching Firebase projects outside local", () => {
    expect(() =>
      validateEnvironment("production", {
        ...productionServices,
        DATABASE_URL: undefined,
        NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
      }),
    ).toThrow("DATABASE_URL is required");
    for (const host of ["127.0.0.1", "127.1", "0.0.0.0", "[::1]", "[::]"]) {
      expect(() =>
        validateEnvironment("production", {
          ...productionServices,
          DATABASE_URL: `postgresql://unyon:unyon@${host}:5432/unyon`,
          NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
        }),
      ).toThrow("non-local PostgreSQL");
    }
    expect(() =>
      validateEnvironment("preview", {
        ...productionServices,
        NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "different-project",
      }),
    ).toThrow("project IDs must match");
  });

  it("allows D1 deployments without a PostgreSQL connection string", () => {
    const d1Services = { ...productionServices, DATABASE_URL: undefined };
    expect(validateEnvironment("preview", {
      ...d1Services,
      NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
      PERSISTENCE_PROVIDER: "d1",
    })).toEqual({
      appEnvironment: "preview",
      appOrigin: "https://preview.unyon.example",
    });
  });

  it("rejects unknown persistence providers", () => {
    expect(() => validateEnvironment("preview", {
      ...productionServices,
      NEXT_PUBLIC_APP_ORIGIN: "https://preview.unyon.example",
      PERSISTENCE_PROVIDER: "kv",
    })).toThrow("PERSISTENCE_PROVIDER must be postgres or d1");
  });
});
