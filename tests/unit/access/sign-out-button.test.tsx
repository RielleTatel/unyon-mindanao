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
});
