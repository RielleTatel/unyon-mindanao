"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withUniversityAdminInvitationFeature, withRepresentativeAppointmentFeature } from "@/features/directory/server";
import type { InvitationActionState } from "@/features/directory/contracts";
import { invitationCopy } from "@/features/directory/invitation-copy";
import { issuedInvitationDetails } from "@/features/directory/issued-invitation";

export async function endRepresentativeAppointment(input: { id: string; idToken: string }): Promise<Pick<InvitationActionState, "error" | "message">> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  try {
    await withRepresentativeAppointmentFeature((feature) => feature.end({ correlationId: crypto.randomUUID(), input, sessionToken }));
  } catch (error) {
    if (error instanceof AccessError && error.code === "RECENT_AUTHENTICATION_REQUIRED") return { error: "Confirm your password again to end this Appointment.", message: null };
    if (error instanceof AccessError && error.code === "CONFLICT") return { error: "This Appointment has already ended. Refresh the page.", message: null };
    return { error: "This Appointment could not be ended. Check your access and try again.", message: null };
  }
  revalidatePath("/portal/team");
  return { error: null, message: "Appointment ended. Historical attribution is preserved." };
}

export type RepresentativeInvitationActionState = InvitationActionState;

export async function representativeInvitationAction(
  _previousState: RepresentativeInvitationActionState,
  formData: FormData,
): Promise<RepresentativeInvitationActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = text(formData, "intent");
  let issued: InvitationActionState["issued"] = null;

  try {
    const result = await withUniversityAdminInvitationFeature(async (feature) => {
      if (intent === "invite") {
        return feature.inviteRepresentative({
          correlationId,
          input: { email: text(formData, "email"), universityId: text(formData, "universityId") },
          sessionToken,
        });
      }
      if (intent === "revoke") {
        await feature.revokeRepresentative({
          correlationId,
          input: { id: text(formData, "id") },
          sessionToken,
        });
        return null;
      }
      throw new AccessError("INVALID_INPUT", "Invalid invitation action");
    });
    if (result) {
      issued = issuedInvitationDetails(result);
    }
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") return { error: "Enter a valid email address.", message: null, issued: null };
      if (error.code === "CONFLICT") return { error: "This email already has a pending invitation or active Representative Appointment.", message: null, issued: null };
      if (error.code === "AUTHENTICATION_REQUIRED") return { error: "Your session has expired. Sign in again.", message: null, issued: null };
      if (error.code === "OPERATION_FAILED") return { error: invitationCopy.createFailed, message: null, issued: null };
      if (error.code === "NOT_FOUND_OR_FORBIDDEN") return { error: "That invitation could not be changed.", message: null, issued: null };
    }
    return { error: "The invitation could not be changed. Try again.", message: null, issued: null };
  }

  revalidatePath("/portal/team");
  return {
    error: null,
    message: intent === "invite" ? invitationCopy.created : "Invitation revoked.",
    issued,
  };
}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
