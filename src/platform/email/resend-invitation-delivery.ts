import "server-only";

import type { InvitationDelivery } from "./contracts";

export function createResendInvitationDelivery(configuration: {
  apiKey: string | undefined;
  from: string | undefined;
}): InvitationDelivery {
  return {
    async send({ email, universityName, invitationUrl, role = "UNIVERSITY_ADMIN" }) {
      if (!configuration.apiKey || !configuration.from) {
        throw new Error("Invitation email delivery is not configured");
      }

      const escapedUniversityName = escapeHtml(universityName);
      const escapedUrl = escapeHtml(invitationUrl);
      const roleName = role === "REPRESENTATIVE" ? "Representative" : "University Admin";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [email],
          subject: role === "REPRESENTATIVE"
            ? `Invitation to join ${universityName} in the Unyon Mindanao Portal`
            : `Invitation to administer ${universityName} in the Unyon Mindanao Portal`,
          text: [
            `You have been invited as a ${roleName} for ${universityName} in the Unyon Mindanao Portal.`,
            "",
            "This link expires in seven days and can be used once:",
            invitationUrl,
            "",
            "If you were not expecting this invitation, you can ignore this email.",
          ].join("\n"),
          html: `<p>You have been invited as a ${roleName} for <strong>${escapedUniversityName}</strong> in the Unyon Mindanao Portal.</p><p><a href="${escapedUrl}">Accept your invitation</a></p><p>This link expires in seven days and can be used once.</p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
        }),
      });

      if (!response.ok) {
        throw new Error("Invitation email provider rejected the message");
      }
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
