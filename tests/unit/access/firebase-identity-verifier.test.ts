import { describe, expect, it } from "vitest";

import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";

function unsignedToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

describe("Firebase identity verifier", () => {
  const payload = {
    aud: "unyon-mindanao-local",
    auth_time: 1_789_556_400,
    email: "admin@unyon.test",
    email_verified: true,
    firebase: { sign_in_provider: "password" },
    exp: 1_789_563_600,
    iat: 1_789_556_400,
    iss: "https://securetoken.google.com/unyon-mindanao-local",
    sub: "firebase-user-1",
    user_id: "firebase-user-1",
  };

  it("accepts emulator tokens only when the emulator is explicitly configured", async () => {
    const verifier = createFirebaseIdentityVerifier({
      emulatorHost: "127.0.0.1:9099",
      projectId: "unyon-mindanao-local",
      now: () => new Date("2026-09-16T12:00:00.000Z"),
    });

    await expect(verifier.verifyIdToken(unsignedToken(payload))).resolves.toEqual({
      authenticatedAt: new Date("2026-09-16T11:00:00.000Z"),
      email: "admin@unyon.test",
      emailVerified: true,
      firebaseUid: "firebase-user-1",
      signInProvider: "password",
    });
  });

  it("rejects unsigned tokens when no emulator is configured", async () => {
    const verifier = createFirebaseIdentityVerifier({
      projectId: "unyon-mindanao-local",
    });

    await expect(
      verifier.verifyIdToken(unsignedToken(payload)),
    ).rejects.toThrow("Invalid Firebase ID token");
  });
});
