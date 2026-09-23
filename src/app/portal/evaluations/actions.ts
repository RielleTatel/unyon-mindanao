"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionCookieName } from "@/features/access/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
import type { EvaluationAnswer } from "@/features/evaluations/contracts";

export async function evaluationAction(_previous: { message: string }, form: FormData) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  try {
    await withEvaluationFeature(async (feature) => {
      if (form.get("intent") === "template") {
        const ratings = String(form.get("ratings") ?? "").split("\n").map((label) => label.trim()).filter(Boolean).map((label) => ({ label, kind: "RATING" }));
        const comments = String(form.get("comments") ?? "").split("\n").map((label) => label.trim()).filter(Boolean).map((label) => ({ label, kind: "COMMENT" }));
        return feature.createTemplate(request({ questions: [...ratings, ...comments] }));
      }
      const id = form.get("id"); const version = Number(form.get("version"));
      if (form.get("intent") === "window") return feature.updateWindow(request({ id, version, closed: form.get("closed") === "on", closesAt: new Date(String(form.get("closesAt")) + "+08:00").toISOString() }));
      if (form.get("intent") === "submit") {
        const answers = [...form.entries()].flatMap<EvaluationAnswer>(([name, value]) => {
          if (name.startsWith("rating-")) return [{ position: Number(name.slice(7)), rating: Number(value), comment: null as string | null }];
          if (name.startsWith("comment-")) return [{ position: Number(name.slice(8)), rating: null as number | null, comment: String(value) }];
          return [];
        });
        return feature.submit(request({ id, version, answers }));
      }
      throw new Error("Invalid action");
    });
    revalidatePath("/portal/evaluations"); revalidatePath("/portal"); return { message: "Evaluation changes saved." };
  } catch { return { message: "Unable to save. Refresh and check required answers, your eligibility, or the evaluation window." }; }
}
