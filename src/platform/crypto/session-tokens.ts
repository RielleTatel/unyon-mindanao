import "server-only";

import type { SessionTokens } from "@/features/access/server";

const tokenByteLength = 32;

export const webCryptoSessionTokens: SessionTokens = {
  create() {
    const bytes = crypto.getRandomValues(new Uint8Array(tokenByteLength));
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

    return btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  },

  async hash(value) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  },
};
