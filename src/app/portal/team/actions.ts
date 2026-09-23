"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withUniversityAdminInvitationFeature, withRepresentativeAppointmentFeature } from "@/features/directory/server";

export async function endRepresentativeAppointment(input: { id: string; idToken: string }): Promise<RepresentativeInvitationActionState> {
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

export interface RepresentativeInvitationActionState {
  error: string | null;
  message: string | null;
}

export async function representativeInvitationAction(
  _previousState: RepresentativeInvitationActionState,
  formData: FormData,
): Promise<RepresentativeInvitationActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = text(formData, "intent");

  try {
    await withUniversityAdminInvitationFeature(async (feature) => {
      if (intent === "invite") {
        await feature.inviteRepresentative({
          correlationId,
          input: { email: text(formData, "email"), universityId: text(formData, "universityId") },
          sessionToken,
        });
      } else if (intent === "revoke") {
        await feature.revokeRepresentative({
          correlationId,
          input: { id: text(formData, "id") },
          sessionToken,
        });
      } else {
        throw new AccessError("INVALID_INPUT", "Invalid invitation action");
      }
    });
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") return { error: "Enter a valid email address.", message: null };
      if (error.code === "CONFLICT") return { error: "This email already has a pending invitation or active Representative Appointment.", message: null };
      if (error.code === "AUTHENTICATION_REQUIRED") return { error: "Your session has expired. Sign in again.", message: null };
      if (error.code === "OPERATION_FAILED") return { error: "The invitation could not be delivered. Check email delivery settings and try again.", message: null };
      if (error.code === "NOT_FOUND_OR_FORBIDDEN") return { error: "That invitation could not be changed.", message: null };
    }
    return { error: "The invitation could not be changed. Try again.", message: null };
  }

  revalidatePath("/portal/team");
  return {
    error: null,
    message: intent === "invite" ? "Invitation sent. It expires in seven days." : "Invitation revoked.",
  };
}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
