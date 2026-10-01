import { FileUpload, PrivateFileLink } from "@/features/private-files/ui/private-file-controls";
import type { FinancialReportRecord } from "../contracts";
import { CorrectionRevisionForm, CreateReportForm, PublishReportForm, ReportActions } from "./report-forms";

const publicationFormatter = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila" });

export function ReportWorkspace({ records, canManage }: { records: FinancialReportRecord[]; canManage: boolean }) {
  return <ReportActions>{canManage && <CreateReportForm />}{!records.length && <p>No Financial Reports published yet.</p>}{records.map((report) => <article key={report.id} className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="text-2xl">{report.title}</h2><p>{report.reportingPeriod}</p><p className="whitespace-pre-wrap">{report.description}</p>
    {report.revisions.map((revision) => <section key={revision.id} className="space-y-3 rounded border p-4"><h3>Revision {revision.revision} · {revision.status}</h3>{revision.publishedAt && <p>Published {publicationFormatter.format(new Date(revision.publishedAt))}</p>}{revision.objectId && <PrivateFileLink objectId={revision.objectId} />}
      {canManage && revision.status === "DRAFT" && <><FileUpload purpose="FINANCIAL_REPORT" resourceId={revision.id} /><PublishReportForm id={report.id} revisionId={revision.id} revision={revision.revision} uploaded={Boolean(revision.objectId)} /></>}
    </section>)}{canManage && !report.revisions.some(({ status }) => status === "DRAFT") && <CorrectionRevisionForm id={report.id} />}
  </article>)}</ReportActions>;
}
