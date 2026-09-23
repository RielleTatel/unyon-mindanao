import { beforeEach, describe, expect, it, vi } from "vitest";

const { end } = vi.hoisted(() => ({ end: vi.fn() }));

vi.mock("@/features/access/server", () => ({
  csrfCookieName: "unyon_csrf",
  secureCookie: false,
  sessionCookieName: "unyon_session",
  withSessionService: async (
    work: (sessions: { end: typeof end }) => Promise<unknown>,
  ) => work({ end }),
}));

import { DELETE } from "@/app/api/auth/session/route";

function signOutRequest() {
  return new Request("http://localhost:3000/api/auth/session", {
    headers: {
      cookie: "unyon_csrf=csrf-token; unyon_session=session-token",
      "x-csrf-token": "csrf-token",
      "x-request-id": "request-1",
    },
    method: "DELETE",
  });
}

describe("DELETE /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stable failure and expires the browser cookie when revocation fails", async () => {
    end.mockRejectedValueOnce(new Error("database credentials leaked here"));

    const response = await DELETE(signOutRequest());

    await expect(response.json()).resolves.toEqual({ error: "OPERATION_FAILED" });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toContain("unyon_session=");
  });

  it("reports success only after the repository revokes the session", async () => {
    end.mockResolvedValueOnce(undefined);

    const response = await DELETE(signOutRequest());

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(end).toHaveBeenCalledWith("session-token", "request-1");
  });
});
