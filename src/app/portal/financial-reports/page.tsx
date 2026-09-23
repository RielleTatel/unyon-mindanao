import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withFinancialReportFeature } from "@/features/financial-reports/server";
import { ReportWorkspace } from "@/features/financial-reports/ui/report-workspace";

export const dynamic = "force-dynamic";
export default async function FinancialReportsPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor; let records;
  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    records = await withFinancialReportFeature((feature) => feature.list({ sessionToken, input: {}, correlationId: crypto.randomUUID() }));
  } catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); throw error; }
  return <main className="min-h-svh px-4 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link href="/portal">← Confederation workspace</Link><h1 className="mb-6 font-serif text-5xl">Financial Reports</h1><ReportWorkspace records={records} canManage={actor.appointments.some(({ role }) => role === "SUPER_ADMIN")} /></div></main>;
}
