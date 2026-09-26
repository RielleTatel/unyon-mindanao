import "server-only";

import { env } from "cloudflare:workers";
import { createD1AccessPersistence } from "./d1-persistence";
import type { D1BatchTransaction } from "./d1-transaction-runner";
import { createSessionService } from "./session-service";
import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";

interface WorkerBindings {
  PORTAL_DB?: D1Database;
}

export async function withD1AccessRuntime<Capabilities extends object, Result>(
  work: (
    sessions: ReturnType<typeof createSessionService>,
    persistence: ReturnType<typeof createD1AccessPersistence<Capabilities>>,
    database: D1Database,
  ) => Promise<Result>,
  createCapabilities?: (
    transaction: D1BatchTransaction,
    occurredAt: Date,
    database: D1Database,
  ) => Capabilities,
) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  const database = (env as unknown as WorkerBindings).PORTAL_DB;
  if (!database) throw new Error("The PORTAL_DB D1 binding is required");

  const persistence = createD1AccessPersistence(database, createCapabilities);
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
      console.error(JSON.stringify({
        dependencyCode:
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : undefined,
        dependencyName: error instanceof Error ? error.name : "UnknownDependencyError",
        event: "access_dependency_failure",
        stage,
      }));
    },
    tokens: webCryptoSessionTokens,
  });
  return work(sessions, persistence, database);
}
