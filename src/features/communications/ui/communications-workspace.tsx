"use client";

import { useActionState } from "react";
import { communicationsAction } from "@/app/portal/announcements/actions";
import { Button } from "@/shared/ui/button";
import type { AnnouncementRecord, ShortcutRecord } from "../contracts";

const initial = { error: null, message: null };
const fieldClass = "mt-1 block min-h-11 w-full rounded-xl border border-primary/25 bg-background px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring";

export function AnnouncementsWorkspace({ records, canManage }: { records: AnnouncementRecord[]; canManage: boolean }) {
  return <div className="grid gap-5">
    {canManage ? <details className="rounded-2xl border border-primary/20 bg-card p-5"><summary className="cursor-pointer font-bold">Create Announcement</summary><AnnouncementEditor /></details> : null}
    {records.length === 0 ? <p>No Announcements published yet.</p> : null}
    {records.map((record) => <article className="rounded-3xl border border-primary/15 bg-card p-6" key={record.id}>
      {canManage ? <p className="m-0 text-xs font-bold uppercase text-primary">{record.status}</p> : null}
      <h2 className="my-3 font-serif text-3xl">{record.title}</h2>
      {record.publishedAt ? <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(record.publishedAt))}</p> : null}
      <p className="whitespace-pre-wrap break-words text-sm leading-7">{record.body}</p>
      {canManage ? <div className="mt-5 grid gap-4 border-t border-primary/15 pt-4">
        {record.status !== "ARCHIVED" ? <details><summary className="cursor-pointer text-sm font-bold">Edit Announcement</summary><AnnouncementEditor record={record} key={record.version} /></details> : null}
        <AnnouncementTransitions record={record} />
      </div> : null}
    </article>)}
  </div>;
}

function AnnouncementEditor({ record }: { record?: AnnouncementRecord }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="mt-4 grid gap-4">
    <input name="intent" type="hidden" value="save-announcement" /><Revision record={record} />
    <label className="text-sm font-semibold">Title<input className={fieldClass} name="title" maxLength={180} required defaultValue={record?.title} /></label>
    <label className="text-sm font-semibold">Announcement text<textarea className={fieldClass} name="body" rows={6} maxLength={10000} required defaultValue={record?.body} /></label>
    <div><Button disabled={pending}>{record ? "Save Announcement" : "Save draft"}</Button></div><Feedback state={state} />
  </form>;
}
function AnnouncementTransitions({ record }: { record: AnnouncementRecord }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="flex flex-wrap items-center gap-3">
    <input name="intent" type="hidden" value="transition-announcement" /><Revision record={record} />
    {record.status === "DRAFT" ? <Button disabled={pending} name="status" value="PUBLISHED">Publish Announcement</Button> : null}
    {record.status !== "ARCHIVED" ? <Button disabled={pending} name="status" value="ARCHIVED" variant="outline">Archive Announcement</Button> : <Button disabled={pending} name="status" value="DRAFT" variant="outline">Restore draft</Button>}
    <Feedback state={state} />
  </form>;
}

export function ShortcutsWorkspace({ records, canManage }: { records: ShortcutRecord[]; canManage: boolean }) {
  return <div className="grid gap-5">
    {canManage ? <details className="rounded-2xl border border-primary/20 bg-card p-5"><summary className="cursor-pointer font-bold">Create Shortcut</summary><ShortcutEditor /></details> : null}
    {records.length === 0 ? <p>No Shortcuts available yet.</p> : null}
    <ol className="grid list-none gap-4 p-0">{records.map((record, index) => <li className="rounded-2xl border border-primary/15 bg-card p-5" key={record.id}>
      <a className="text-lg font-bold text-primary underline-offset-4 hover:underline" href={record.url} rel="noopener noreferrer" target="_blank">{record.icon ? <span aria-hidden="true">{record.icon} </span> : null}{record.label} ↗<span className="ml-2 text-xs font-normal">External link · opens in a new tab</span></a>
      {canManage ? <div className="mt-3 grid gap-3">
        <p className="m-0 text-xs text-muted-foreground">{record.active ? "Active" : "Inactive"}</p>
        <details><summary className="cursor-pointer text-sm font-bold">Edit Shortcut</summary><ShortcutEditor record={record} key={record.version} /></details>
        <ShortcutOrder records={records} index={index} />
      </div> : null}
    </li>)}</ol>
  </div>;
}

function ShortcutEditor({ record }: { record?: ShortcutRecord }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="mt-4 grid gap-3">
    <input name="intent" type="hidden" value="save-shortcut" /><Revision record={record} />
    <label className="text-sm font-semibold">Label<input className={fieldClass} name="label" maxLength={120} required defaultValue={record?.label} /></label>
    <label className="text-sm font-semibold">External URL<input className={fieldClass} name="url" type="url" maxLength={2000} required defaultValue={record?.url} /></label>
    <label className="text-sm font-semibold">Icon (optional text or emoji)<input className={fieldClass} name="icon" maxLength={48} defaultValue={record?.icon ?? ""} /></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={record?.active ?? true} />Active</label>
    <div><Button disabled={pending}>Save Shortcut</Button></div><Feedback state={state} />
  </form>;
}

function ShortcutOrder({ records, index }: { records: ShortcutRecord[]; index: number }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  const order = (offset: number) => { const ids = records.map(({ id }) => id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]; return JSON.stringify(ids); };
  return <form action={action} className="flex flex-wrap items-center gap-2"><input name="intent" type="hidden" value="reorder-shortcuts" />
    <Button variant="outline" name="ids" value={index > 0 ? order(-1) : "[]"} disabled={pending || index === 0}>Move up</Button>
    <Button variant="outline" name="ids" value={index < records.length - 1 ? order(1) : "[]"} disabled={pending || index === records.length - 1}>Move down</Button>
    <Feedback state={state} />
  </form>;
}
function Revision({ record }: { record?: { id: string; version: number } }) { return record ? <><input type="hidden" name="id" value={record.id} /><input type="hidden" name="version" value={record.version} /></> : null; }
function Feedback({ state }: { state: { error: string | null; message: string | null } }) { return <>{state.error ? <p className="m-0 text-sm text-destructive" role="alert">{state.error}</p> : null}{state.message ? <p className="m-0 text-sm text-primary" role="status">{state.message}</p> : null}</>; }
