"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withUniversityAdminInvitationFeature } from "@/features/directory/server";
import type { InvitationActionState } from "@/features/directory/contracts";
import { invitationCopy } from "@/features/directory/invitation-copy";
import { issuedInvitationDetails } from "@/features/directory/issued-invitation";

export async function universityAdminInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = formText(formData, "intent");
  let issued: InvitationActionState["issued"] = null;

  try {
    if (intent === "invite") {
      const result = await withUniversityAdminInvitationFeature((feature) =>
        feature.invite({
          correlationId,
          input: {
            email: formText(formData, "email"),
            universityId: formText(formData, "universityId"),
          },
          sessionToken,
        }),
      );
      issued = issuedInvitationDetails(result);
    } else if (intent === "revoke") {
      await withUniversityAdminInvitationFeature((feature) =>
        feature.revoke({
          correlationId,
          input: { id: formText(formData, "id") },
          sessionToken,
        }),
      );
    } else {
      return { error: "That request could not be completed.", message: null, issued: null };
    }
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") {
        return { error: "Enter a valid email address.", message: null, issued: null };
      }
      if (error.code === "CONFLICT") {
        return {
          error: "This email already has a pending invitation or appointment for that university.",
          message: null,
          issued: null,
        };
      }
      if (error.code === "NOT_FOUND_OR_FORBIDDEN") {
        return { error: "That invitation could not be changed.", message: null, issued: null };
      }
      if (error.code === "AUTHENTICATION_REQUIRED") {
        return { error: "Your session has expired. Sign in again.", message: null, issued: null };
      }
      if (error.code === "OPERATION_FAILED") {
        revalidatePath("/portal/universities");
        return {
          error: invitationCopy.createFailed,
          message: null,
          issued: null,
        };
      }
    }

    return { error: "The invitation could not be changed. Try again.", message: null, issued: null };
  }

  revalidatePath("/portal/universities");
  return {
    error: null,
    message: intent === "invite" ? invitationCopy.created : "Invitation revoked.",
    issued,
  };
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
