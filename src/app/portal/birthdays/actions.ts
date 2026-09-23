"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withBirthdayFeature } from "@/features/directory/server";
import type { RestrictedBirthDate } from "@/features/directory/contracts";

export async function birthdayAction(input: { action: "read" | "update" | "retention"; id?: string; idToken: string; birthDate?: string | null; version?: number }): Promise<{ error?: string; message?: string; record?: RestrictedBirthDate }> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const request = { input, sessionToken, correlationId: crypto.randomUUID() };
  try {
    const result = await withBirthdayFeature(async (feature) => {
      if (input.action === "read") return { record: await feature.read(request) };
      if (input.action === "update") {
        await feature.update(request);
        return { message: "Birth date saved." };
      }
      if (input.action === "retention") {
        const result = await feature.removeExpired(request);
        return { message: `Removed ${result.removed} expired birth dates. Officer history is preserved.` };
      }
      throw new AccessError("INVALID_INPUT", "Invalid operation");
    });
    if (input.action !== "read") {
      revalidatePath("/portal/birthdays");
      revalidatePath("/portal");
    }
    return result;
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "RECENT_AUTHENTICATION_REQUIRED") return { error: "Confirm your password again." };
      if (error.code === "INVALID_INPUT") return { error: "Enter a valid birth date that is not in the future." };
      if (error.code === "CONFLICT") return { error: "This record changed. Load the birth date again before saving." };
    }
    return { error: "This birth-date operation is unavailable. Check your access and try again." };
  }
}
