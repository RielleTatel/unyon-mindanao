import { describe, expect, it } from "vitest";

import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";

describe("web crypto session tokens", () => {
  it("creates high-entropy opaque values and hashes them deterministically", async () => {
    const first = webCryptoSessionTokens.create();
    const second = webCryptoSessionTokens.create();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/u);
    await expect(webCryptoSessionTokens.hash(first)).resolves.toMatch(
      /^[a-f0-9]{64}$/u,
    );
    await expect(webCryptoSessionTokens.hash(first)).resolves.toBe(
      await webCryptoSessionTokens.hash(first),
    );
  });
});
