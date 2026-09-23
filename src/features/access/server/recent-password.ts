import "server-only";

import type { IdentityVerifier, PortalActor } from "./contracts";
import { AccessError } from "./errors";

export async function requireRecentPassword(
  verifier: IdentityVerifier,
  actor: PortalActor,
  idToken: string,
  occurredAt: Date,
) {
  try {
    const identity = await verifier.verifyIdToken(idToken);
    const age = occurredAt.getTime() - identity.authenticatedAt.getTime();
    if (identity.emailVerified && identity.firebaseUid === actor.firebaseUid && identity.email === actor.email && identity.signInProvider === "password" && Number.isFinite(age) && age >= 0 && age <= 300_000) return;
  } catch {
    // Identity provider errors and credentials must not cross the feature seam.
  }
  throw new AccessError("RECENT_AUTHENTICATION_REQUIRED", "Confirm your password again");
}
