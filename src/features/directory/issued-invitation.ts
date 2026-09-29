import type { IssuedInvitationLinkDetails, UniversityAdminInvitationRecord } from "./contracts";

export function issuedInvitationDetails(issued: {
  invitation: Pick<UniversityAdminInvitationRecord, "email" | "role" | "universityName" | "expiresAt">;
  invitationUrl: string;
}): IssuedInvitationLinkDetails {
  return {
    url: issued.invitationUrl,
    email: issued.invitation.email,
    role: issued.invitation.role,
    universityName: issued.invitation.universityName,
    expiresAt: issued.invitation.expiresAt,
  };
}
