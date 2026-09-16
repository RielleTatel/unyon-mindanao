import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortalShell } from "@/features/dashboard/ui/portal-shell";

describe("Portal shell", () => {
  it("introduces the private Confederation workspace without campaign copy", () => {
    render(<PortalShell />);

    expect(
      screen.getByRole("heading", { name: "One private space for Unyon Mindanao" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Events, updates, and shared records—kept in one governed portal."),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Sign in" })
        .every((link) => link.getAttribute("href") === "/sign-in"),
    ).toBe(true);
    expect(screen.queryByText(/year 5/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/anchored in the currents/i)).not.toBeInTheDocument();
  });
});
