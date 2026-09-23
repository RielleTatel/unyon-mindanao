import { afterEach, describe, expect, it, vi } from "vitest";

import { createResendInvitationDelivery } from "@/platform/email/resend-invitation-delivery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend invitation email adapter", () => {
  it("sends the invitation link through the email provider without logging it", async () => {
    let requestUrl: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;
    const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = input;
      requestInit = init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", send);
    const delivery = createResendInvitationDelivery({
      apiKey: "re_test_key",
      from: "portal@unyon.example",
    });

    await delivery.send({
      email: "admin@university.example",
      universityName: "University of Mindanao",
      invitationUrl: "https://portal.unyon.example/accept-invitation#one-time-token",
    });

    expect(requestUrl).toBe("https://api.resend.com/emails");
    expect(send).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test_key",
          "Content-Type": "application/json",
        },
      }),
    );
    const message = JSON.parse(String(requestInit?.body)) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };

    expect(message.to).toEqual(["admin@university.example"]);
    expect(message.subject).toContain("University of Mindanao");
    expect(message.text).toContain("#one-time-token");
    expect(message.html).toContain("#one-time-token");
  });

  it("fails closed if delivery is not configured or rejected", async () => {
    const input = {
      email: "admin@university.example",
      universityName: "University of Mindanao",
      invitationUrl: "https://portal.unyon.example/accept-invitation#token",
    };
    const unconfigured = createResendInvitationDelivery({ apiKey: undefined, from: undefined });

    await expect(unconfigured.send(input)).rejects.toThrow("not configured");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const rejected = createResendInvitationDelivery({
      apiKey: "re_test_key",
      from: "portal@unyon.example",
    });

    await expect(rejected.send(input)).rejects.toThrow("rejected the message");
  });
});
