import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withEvaluationFeature } from "@/features/evaluations/server";
import { EvaluationsWorkspace } from "@/features/evaluations/ui/evaluations-workspace";
import { Pagination } from "@/shared/ui/pagination";
export const dynamic = "force-dynamic";
export default async function EvaluationsPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const query = await searchParams;
  let page;
  try {
    page = await withEvaluationFeature((feature) => feature.page({ sessionToken, input: { page: Number(query.page ?? 0), pageSize: Number(query.pageSize ?? 50) }, correlationId: crypto.randomUUID() }));
  } catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); if (error instanceof AccessError && error.code === "INVALID_INPUT") notFound(); throw error; }
  return <main className="mx-auto min-h-svh max-w-4xl px-5 py-10"><Link href="/portal">← Confederation workspace</Link><h1 className="mt-6 font-serif text-4xl">Event Evaluations</h1><EvaluationsWorkspace records={page.records} canManage={page.canManage} /><Pagination href="/portal/evaluations" pagination={page} /></main>;
}
