"use server";
import { cookies } from "next/headers";
import { sessionCookieName, verifyRecentPasswordForSession } from "@/features/access/server";
import { withBirthdayFeature } from "@/features/directory/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
import { withPrivateFileFeature } from "@/features/private-files/server";

export async function maintenanceAction(idToken: string) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  try {
    const actor = await verifyRecentPasswordForSession(sessionToken, idToken);
    if (!actor.appointments.some(({ role }) => role === "SUPER_ADMIN")) throw new Error("Insufficient authority");
    const birthdays = await withBirthdayFeature((feature) => feature.removeExpired(request({ idToken })));
    const evaluations = await withEvaluationFeature((feature) => feature.expireResponses(request({})));
    const files = await withPrivateFileFeature((feature) => feature.cleanup(request({})));
    return { message: `Maintenance complete: ${birthdays.removed} old birth dates removed, ${evaluations.removed} expired Evaluation responses removed, ${files.removed} staged files cleaned.` };
  } catch { return { message: "Maintenance could not finish. Check your password and access, then retry; completed steps are safe to repeat." }; }
}
