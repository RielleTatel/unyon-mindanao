"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionCookieName } from "@/features/access/server";
import { withFinancialReportFeature } from "@/features/financial-reports/server";

export async function reportAction(_previous: { message: string }, form: FormData) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const request = { sessionToken, correlationId: crypto.randomUUID(), input: Object.fromEntries(form) };
  try {
    await withFinancialReportFeature((feature) => {
      if (form.get("intent") === "create") return feature.create(request);
      if (form.get("intent") === "revise") return feature.revise(request);
      if (form.get("intent") === "publish") return feature.publish(request);
      throw new Error("Invalid intent");
    });
    revalidatePath("/portal/financial-reports");
    return { message: "Report saved." };
  } catch { return { message: "Report could not be saved. Check your access and finish the draft PDF upload before publishing." }; }
}
