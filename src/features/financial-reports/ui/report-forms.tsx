"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { reportAction } from "@/app/portal/financial-reports/actions";

const ActionContext = createContext<{ action: (form: FormData) => void; pending: boolean } | null>(null);

export function ReportActions({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(reportAction, { message: "" });
  return <ActionContext.Provider value={{ action, pending }}><div className="space-y-8"><p role="status">{state.message}</p>{children}</div></ActionContext.Provider>;
}

function useReportAction() {
  const context = useContext(ActionContext);
  if (!context) throw new Error("Report actions unavailable");
  return context;
}

export function CreateReportForm() {
  const { action, pending } = useReportAction();
  return <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
    <h2 className="text-2xl">Create Financial Report</h2><input type="hidden" name="intent" value="create" />
    <label>Title<input className="block w-full rounded border p-2" name="title" required maxLength={180} /></label>
    <label>Reporting period<input className="block w-full rounded border p-2" name="reportingPeriod" required maxLength={120} placeholder="e.g. September 2026" /></label>
    <label>Description<textarea className="block w-full rounded border p-2" name="description" required maxLength={3000} /></label><button disabled={pending} className="rounded bg-primary px-4 py-2 text-primary-foreground">Create draft</button>
  </form>;
}

export function PublishReportForm({ id, revisionId, revision, uploaded }: { id: string; revisionId: string; revision: number; uploaded: boolean }) {
  const { action, pending } = useReportAction();
  return <form action={action}><input type="hidden" name="intent" value="publish" /><input type="hidden" name="id" value={id} /><input type="hidden" name="revisionId" value={revisionId} /><button className="rounded border px-4 py-2" disabled={pending || !uploaded}>Publish revision {revision}</button></form>;
}

export function CorrectionRevisionForm({ id }: { id: string }) {
  const { action, pending } = useReportAction();
  return <form action={action}><input type="hidden" name="intent" value="revise" /><input type="hidden" name="id" value={id} /><button disabled={pending} className="rounded border px-4 py-2">Create correction revision</button></form>;
}
