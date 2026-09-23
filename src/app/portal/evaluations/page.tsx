import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
import { EvaluationsWorkspace } from "@/features/evaluations/ui/evaluations-workspace";
export const dynamic = "force-dynamic";
export default async function EvaluationsPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor; let records;
  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    records = await withEvaluationFeature((feature) => feature.list({ sessionToken, input: {}, correlationId: crypto.randomUUID() }));
  } catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); throw error; }
  return <main className="mx-auto min-h-svh max-w-4xl px-5 py-10"><Link href="/portal">← Confederation workspace</Link><h1 className="mt-6 font-serif text-4xl">Event Evaluations</h1><EvaluationsWorkspace records={records} canManage={actor.appointments.some(({ role }) => role === "SUPER_ADMIN")} /></main>;
}
