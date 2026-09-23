"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionCookieName } from "@/features/access/server";
import { withAccountFeature } from "@/features/directory/server";
export async function accountAction(intent: "status" | "end", input: unknown) {
  try {
    const request = { input, sessionToken: (await cookies()).get(sessionCookieName)?.value ?? "", correlationId: crypto.randomUUID() };
    await withAccountFeature((feature) => intent === "status" ? feature.setStatus(request) : feature.endAppointment(request));
    revalidatePath("/portal/accounts"); return { message: "Account change saved. Existing sessions were revoked when required." };
  } catch { return { message: "Unable to change this account. Confirm your password and current authority." }; }
}
