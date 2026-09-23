import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  push,
  refresh,
  signInWithPortalIdentity,
  signOutPortalIdentity,
} = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithPortalIdentity: vi.fn(async () => "firebase-id-token"),
  signOutPortalIdentity: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/features/access/client/firebase-auth", () => ({
  signInWithPortalIdentity,
  signOutPortalIdentity,
}));

import { SignInForm } from "@/features/access/ui/sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a Firebase ID token for a portal session without sending the password", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "csrf-token-0123456789abcdef" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SignInForm />);
    await user.type(screen.getByLabelText("Email address"), "admin@unyon.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in securely" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/portal"));
    expect(signInWithPortalIdentity).toHaveBeenCalledWith(
      "admin@unyon.test",
      "password123",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/session",
      expect.objectContaining({
        body: JSON.stringify({ idToken: "firebase-id-token" }),
        method: "POST",
      }),
    );
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).not.toContain("password123");
  });

  it("uses one generic denial message when the portal rejects an identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ token: "csrf-token-0123456789abcdef" })),
        )
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );
    const user = userEvent.setup();

    render(<SignInForm />);
    await user.type(screen.getByLabelText("Email address"), "unknown@unyon.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in securely" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in was not accepted",
    );
    expect(signOutPortalIdentity).toHaveBeenCalledOnce();
  });
});
