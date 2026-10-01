import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withFinancialReportFeature } from "@/features/financial-reports/server";
import { ReportWorkspace } from "@/features/financial-reports/ui/report-workspace";
import { Pagination } from "@/shared/ui/pagination";

export const dynamic = "force-dynamic";
export default async function FinancialReportsPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const query = await searchParams;
  let page;
  try {
    page = await withFinancialReportFeature((feature) => feature.page({ sessionToken, input: { page: Number(query.page ?? 0), pageSize: Number(query.pageSize ?? 50) }, correlationId: crypto.randomUUID() }));
  } catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); if (error instanceof AccessError && error.code === "INVALID_INPUT") notFound(); throw error; }
  return <main className="min-h-svh px-4 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link href="/portal">← Confederation workspace</Link><h1 className="mb-6 font-serif text-5xl">Financial Reports</h1><ReportWorkspace records={page.records} canManage={page.canManage} /><Pagination href="/portal/financial-reports" pagination={page} /></div></main>;
}
