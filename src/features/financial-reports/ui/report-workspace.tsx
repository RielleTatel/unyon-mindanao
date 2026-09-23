"use client";
import { useActionState } from "react";
import { reportAction } from "@/app/portal/financial-reports/actions";
import { FileUpload, PrivateFileLink } from "@/features/private-files/ui/private-file-controls";
import type { FinancialReportRecord } from "../contracts";

export function ReportWorkspace({ records, canManage }: { records: FinancialReportRecord[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(reportAction, { message: "" });
  return <div className="space-y-8"><p role="status">{state.message}</p>{canManage && <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
    <h2 className="text-2xl">Create Financial Report</h2><input type="hidden" name="intent" value="create" />
    <label>Title<input className="block w-full rounded border p-2" name="title" required maxLength={180} /></label>
    <label>Reporting period<input className="block w-full rounded border p-2" name="reportingPeriod" required maxLength={120} placeholder="e.g. September 2026" /></label>
    <label>Description<textarea className="block w-full rounded border p-2" name="description" required maxLength={3000} /></label><button disabled={pending} className="rounded bg-primary px-4 py-2 text-primary-foreground">Create draft</button>
  </form>}{!records.length && <p>No Financial Reports published yet.</p>}{records.map((report) => <article key={report.id} className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="text-2xl">{report.title}</h2><p>{report.reportingPeriod}</p><p className="whitespace-pre-wrap">{report.description}</p>
    {report.revisions.map((revision) => <section key={revision.id} className="space-y-3 rounded border p-4"><h3>Revision {revision.revision} · {revision.status}</h3>{revision.publishedAt && <p>Published {new Date(revision.publishedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</p>}{revision.objectId && <PrivateFileLink objectId={revision.objectId} />}
      {canManage && revision.status === "DRAFT" && <><FileUpload purpose="FINANCIAL_REPORT" resourceId={revision.id} /><form action={action}><input type="hidden" name="intent" value="publish" /><input type="hidden" name="id" value={report.id} /><input type="hidden" name="revisionId" value={revision.id} /><button className="rounded border px-4 py-2" disabled={pending || !revision.objectId}>Publish revision {revision.revision}</button></form></>}
    </section>)}{canManage && !report.revisions.some(({ status }) => status === "DRAFT") && <form action={action}><input type="hidden" name="intent" value="revise" /><input type="hidden" name="id" value={report.id} /><button disabled={pending} className="rounded border px-4 py-2">Create correction revision</button></form>}
  </article>)}</div>;
}
