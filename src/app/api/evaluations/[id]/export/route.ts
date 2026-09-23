import { cookies } from "next/headers";
import { sessionCookieName } from "@/features/access/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
    const csv = await withEvaluationFeature((feature) => feature.exportCsv({ input: { id }, sessionToken, correlationId: crypto.randomUUID() }));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="evaluation-results.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Results unavailable", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
