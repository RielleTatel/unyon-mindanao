import "server-only";

import { createAccessPersistence, type AccessPersistence } from "./persistence";
import type { AccessTransaction } from "./prisma-helpers";
import { createSessionService } from "./session-service";
import { createPrismaClient } from "@/platform/database/client";
import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";

export async function withSessionService<Result>(
  work: (
    sessions: ReturnType<typeof createSessionService>,
  ) => Promise<Result>,
) {
  return withAccessRuntime<Record<string, never>, Result>(async (sessions) =>
    work(sessions),
  );
}

export async function withAccessRuntime<
  Capabilities extends object,
  Result,
>(
  work: (
    sessions: ReturnType<typeof createSessionService>,
    persistence: AccessPersistence<Capabilities>,
  ) => Promise<Result>,
  createCapabilities?: (
    transaction: AccessTransaction,
    occurredAt: Date,
  ) => Capabilities,
) {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required");
  }

  const prisma = createPrismaClient();
  const persistence = createAccessPersistence(prisma, createCapabilities);
  const sessions = createSessionService({
    identityVerifier: createFirebaseIdentityVerifier({
      emulatorHost:
        process.env.APP_ENV === "local"
          ? process.env.FIREBASE_AUTH_EMULATOR_HOST
          : undefined,
      projectId,
    }),
    repository: persistence.sessions,
    reportFailure(stage, error) {
      console.error(
        JSON.stringify({
          dependencyCode:
            typeof error === "object" && error && "code" in error
              ? String(error.code)
              : undefined,
          dependencyName:
            error instanceof Error ? error.name : "UnknownDependencyError",
          event: "access_dependency_failure",
          localDiagnostic:
            process.env.APP_ENV === "local" && error instanceof Error
              ? error.message
                  .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/giu, "[database-url-redacted]")
                  .slice(0, 300)
              : undefined,
          stage,
        }),
      );
    },
    tokens: webCryptoSessionTokens,
  });

  try {
    return await work(sessions, persistence);
  } finally {
    await prisma.$disconnect();
  }
}
