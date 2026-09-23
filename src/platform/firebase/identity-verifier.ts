import "server-only";

import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";

import type {
  IdentityVerifier,
  VerifiedIdentity,
} from "@/features/access/server";

interface FirebaseIdentityVerifierOptions {
  projectId: string;
  emulatorHost?: string;
  now?: () => Date;
}

const maximumClockSkewSeconds = 300;

export function createFirebaseIdentityVerifier({
  emulatorHost,
  projectId,
  now = () => new Date(),
}: FirebaseIdentityVerifierOptions): IdentityVerifier {
  const issuer = `https://securetoken.google.com/${projectId}`;
  const firebaseKeys = createRemoteJWKSet(
    new URL(
      "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
    ),
  );

  return {
    async verifyIdToken(idToken): Promise<VerifiedIdentity> {
      try {
        const header = decodeProtectedHeader(idToken);
        let payload: JWTPayload;

        if (emulatorHost) {
          if (header.alg !== "none") {
            throw new Error("Unexpected emulator token algorithm");
          }
          payload = decodeJwt(idToken);
        } else {
          if (header.alg !== "RS256") {
            throw new Error("Unexpected Firebase token algorithm");
          }
          const verified = await jwtVerify(idToken, firebaseKeys, {
            algorithms: ["RS256"],
            audience: projectId,
            currentDate: now(),
            issuer,
          });
          payload = verified.payload;
        }

        return parseIdentity(payload, { issuer, now: now() });
      } catch {
        throw new Error("Invalid Firebase ID token");
      }
    },
  };
}

function parseIdentity(
  payload: JWTPayload,
  { issuer, now }: { issuer: string; now: Date },
): VerifiedIdentity {
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const expectedProjectId = issuer.slice(issuer.lastIndexOf("/") + 1);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const authenticationTime = payload.auth_time;

  if (
    payload.iss !== issuer ||
    !audience.includes(expectedProjectId) ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 128 ||
    typeof payload.email !== "string" ||
    typeof payload.email_verified !== "boolean" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof authenticationTime !== "number" ||
    payload.iat > nowSeconds + maximumClockSkewSeconds ||
    authenticationTime > nowSeconds + maximumClockSkewSeconds ||
    payload.exp <= nowSeconds
  ) {
    throw new Error("Invalid Firebase claims");
  }

  return {
    authenticatedAt: new Date(authenticationTime * 1000),
    signInProvider: typeof payload.firebase === "object" && payload.firebase !== null && "sign_in_provider" in payload.firebase && typeof payload.firebase.sign_in_provider === "string" ? payload.firebase.sign_in_provider : undefined,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified,
    firebaseUid: payload.sub,
  };
}
