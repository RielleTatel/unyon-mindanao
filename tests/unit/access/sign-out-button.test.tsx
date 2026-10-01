import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh, signOutPortalIdentity } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOutPortalIdentity: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/features/access/client/firebase-auth", () => ({
  signOutPortalIdentity,
}));

import { SignOutButton } from "@/features/access/ui/sign-out-button";
import * as identityLoader from "@/features/access/client/load-portal-identity";

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects only after server revocation and Firebase sign-out succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ token: "csrf-token" })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }))),
    );

    render(<SignOutButton />);
    expect(signOutPortalIdentity).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in"));
    expect(signOutPortalIdentity).toHaveBeenCalledOnce();
  });

  it("clears Firebase state but reports a stable error when server revocation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ token: "csrf-token" })))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );

    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-out could not be confirmed",
    );
    expect(signOutPortalIdentity).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it("allows retry when the identity action fails after the portal session is revoked", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      new Response(JSON.stringify(init?.method === "DELETE" ? { ok: true } : { token: "csrf-token" })),
    ));
    signOutPortalIdentity.mockRejectedValueOnce(new Error("Identity unavailable"));
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in"));
    expect(signOutPortalIdentity).toHaveBeenCalledTimes(2);
  });

  it("reports a failed identity import and completes sign-out after loading recovers", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      new Response(JSON.stringify(init?.method === "DELETE" ? { ok: true } : { token: "csrf-token" })),
    ));
    const load = vi.spyOn(identityLoader, "loadPortalIdentity").mockRejectedValueOnce(new TypeError("Identity module unavailable"));
    try {
      render(<SignOutButton />);
      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
      expect(signOutPortalIdentity).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in"));
      expect(signOutPortalIdentity).toHaveBeenCalledOnce();
    } finally { load.mockRestore(); }
  });
});
