"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withUniversityAdminInvitationFeature } from "@/features/directory/server";

export interface InvitationActionState {
  error: string | null;
  message: string | null;
}

export async function universityAdminInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = formText(formData, "intent");

  try {
    if (intent === "invite") {
      await withUniversityAdminInvitationFeature((feature) =>
        feature.invite({
          correlationId,
          input: {
            email: formText(formData, "email"),
            universityId: formText(formData, "universityId"),
          },
          sessionToken,
        }),
      );
    } else if (intent === "revoke") {
      await withUniversityAdminInvitationFeature((feature) =>
        feature.revoke({
          correlationId,
          input: { id: formText(formData, "id") },
          sessionToken,
        }),
      );
    } else {
      return { error: "That request could not be completed.", message: null };
    }
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") {
        return { error: "Enter a valid email address.", message: null };
      }
      if (error.code === "CONFLICT") {
        return {
          error: "This email already has a pending invitation or appointment for that university.",
          message: null,
        };
      }
      if (error.code === "NOT_FOUND_OR_FORBIDDEN") {
        return { error: "That invitation could not be changed.", message: null };
      }
      if (error.code === "AUTHENTICATION_REQUIRED") {
        return { error: "Your session has expired. Sign in again.", message: null };
      }
      if (error.code === "OPERATION_FAILED") {
        revalidatePath("/portal/universities");
        return {
          error: "The invitation could not be delivered. Check email delivery settings and try again.",
          message: null,
        };
      }
    }

    return { error: "The invitation could not be changed. Try again.", message: null };
  }

  revalidatePath("/portal/universities");
  return {
    error: null,
    message: intent === "invite" ? "Invitation sent. It expires in seven days." : "Invitation revoked.",
  };
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
