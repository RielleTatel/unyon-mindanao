import "server-only";

import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";

export const csrfCookieName = "unyon_csrf";
export const sessionCookieName = "unyon_session";

export const secureCookie = process.env.NODE_ENV === "production";

export function createCsrfToken() {
  return webCryptoSessionTokens.create();
}
