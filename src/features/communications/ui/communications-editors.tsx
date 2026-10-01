"use client";

import { useActionState } from "react";
import { communicationsAction } from "@/app/portal/announcements/actions";
import { Button } from "@/shared/ui/button";
import type { AnnouncementRecord, ShortcutRecord } from "../contracts";
import { Feedback, Revision } from "./communications-form-state";

const initial = { error: null, message: null };

const fieldClass = "mt-1 block min-h-11 w-full rounded-xl border border-primary/25 bg-background px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring";

export function AnnouncementEditor({ record }: { record?: AnnouncementRecord }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="mt-4 grid gap-4">
    <input name="intent" type="hidden" value="save-announcement" /><Revision record={record} />
    <label className="text-sm font-semibold">Title<input className={fieldClass} name="title" maxLength={180} required defaultValue={record?.title} /></label>
    <label className="text-sm font-semibold">Announcement text<textarea className={fieldClass} name="body" rows={6} maxLength={10000} required defaultValue={record?.body} /></label>
    <div><Button disabled={pending}>{record ? "Save Announcement" : "Save draft"}</Button></div><Feedback state={state} />
  </form>;
}
export function ShortcutEditor({ record }: { record?: ShortcutRecord }) {
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
