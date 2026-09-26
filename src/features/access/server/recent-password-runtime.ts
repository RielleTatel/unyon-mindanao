import "server-only";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { requireRecentPassword } from "./recent-password";
import { withSessionService } from "./runtime";

export async function verifyRecentPasswordForSession(sessionToken: string, idToken: string) {
  return withSessionService(async (sessions) => {
    const actor = await sessions.require(sessionToken, crypto.randomUUID());
    const verifier = createFirebaseIdentityVerifier({ projectId: process.env.FIREBASE_PROJECT_ID!, emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined });
    await requireRecentPassword(verifier, actor, idToken, new Date());
    return actor;
  });
}
