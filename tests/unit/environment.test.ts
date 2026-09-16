import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  validateEnvironment,
} from "@/shared/config/environment";

describe("environment validation", () => {
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
        }),
      ).toThrow("NEXT_PUBLIC_APP_ORIGIN must use HTTPS");
    },
  );

  it("returns only values intended for the portal runtime", () => {
    expect(
      validateEnvironment("production", {
        NEXT_PUBLIC_APP_ORIGIN: "https://portal.unyon.example",
        DATABASE_URL: "postgres://private-value",
      }),
    ).toEqual({
      appEnvironment: "production",
      appOrigin: "https://portal.unyon.example",
    });
  });
});
