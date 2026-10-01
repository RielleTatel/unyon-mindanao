import type { AnnouncementRecord, ShortcutRecord } from "../contracts";
import { AnnouncementTransitions, ShortcutOrder } from "./communications-controls";
import { AnnouncementEditor, ShortcutEditor } from "./communications-editors";

const publicationDateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export function AnnouncementsWorkspace({ records, canManage }: { records: AnnouncementRecord[]; canManage: boolean }) {
  return <div className="grid gap-5">
    {canManage ? <details className="rounded-2xl border border-primary/20 bg-card p-5"><summary className="cursor-pointer font-bold">Create Announcement</summary><AnnouncementEditor /></details> : null}
    {records.length === 0 ? <p>No Announcements published yet.</p> : null}
    {records.map((record) => <article className="rounded-3xl border border-primary/15 bg-card p-6" key={record.id}>
      {canManage ? <p className="m-0 text-xs font-bold uppercase text-primary">{record.status}</p> : null}
      <h2 className="my-3 font-serif text-3xl">{record.title}</h2>
      {record.publishedAt ? <p className="text-xs text-muted-foreground">{publicationDateFormatter.format(new Date(record.publishedAt))}</p> : null}
      <p className="whitespace-pre-wrap break-words text-sm leading-7">{record.body}</p>
      {canManage ? <div className="mt-5 grid gap-4 border-t border-primary/15 pt-4">
        {record.status !== "ARCHIVED" ? <details><summary className="cursor-pointer text-sm font-bold">Edit Announcement</summary><AnnouncementEditor record={record} key={record.version} /></details> : null}
        <AnnouncementTransitions record={{ id: record.id, version: record.version, status: record.status }} />
      </div> : null}
    </article>)}
  </div>;
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
        <ShortcutOrder record={{ id: record.id, version: record.version }} first={index === 0} last={index === records.length - 1} />
      </div> : null}
    </li>)}</ol>
  </div>;
}
