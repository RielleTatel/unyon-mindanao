import { describe, expect, it, vi } from "vitest";

import { createSuperAdminBootstrap } from "@/features/access/server";

describe("Super Admin bootstrap", () => {
  it("normalizes identity data and delegates one idempotent bootstrap transaction", async () => {
    const bootstrap = vi.fn(async () => ({
      appointmentId: "appointment-1",
      created: true,
      portalUserId: "user-1",
    }));
    const run = createSuperAdminBootstrap({ bootstrap });

    await expect(
      run({
        correlationId: "bootstrap-1",
        email: "  ADMIN@Unyon.Test ",
        firebaseUid: "firebase-1",
        fullName: "  Unyon Administrator  ",
      }),
    ).resolves.toEqual({
      appointmentId: "appointment-1",
      created: true,
      portalUserId: "user-1",
    });
    expect(bootstrap).toHaveBeenCalledWith({
      correlationId: "bootstrap-1",
      email: "admin@unyon.test",
      firebaseUid: "firebase-1",
      fullName: "Unyon Administrator",
    });
  });
});
