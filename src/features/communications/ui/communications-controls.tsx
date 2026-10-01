"use client";

import { useActionState } from "react";
import { communicationsAction } from "@/app/portal/announcements/actions";
import { Button } from "@/shared/ui/button";
import type { AnnouncementRecord, ShortcutRecord } from "../contracts";
import { Feedback, Revision } from "./communications-form-state";

const initial = { error: null, message: null };

export function AnnouncementTransitions({ record }: { record: Pick<AnnouncementRecord, "id" | "version" | "status"> }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="flex flex-wrap items-center gap-3">
    <input name="intent" type="hidden" value="transition-announcement" /><Revision record={record} />
    {record.status === "DRAFT" ? <Button disabled={pending} name="status" value="PUBLISHED">Publish Announcement</Button> : null}
    {record.status !== "ARCHIVED" ? <Button disabled={pending} name="status" value="ARCHIVED" variant="outline">Archive Announcement</Button> : <Button disabled={pending} name="status" value="DRAFT" variant="outline">Restore draft</Button>}
    <Feedback state={state} />
  </form>;
}

export function ShortcutOrder({ record, first, last }: { record: Pick<ShortcutRecord, "id" | "version">; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState(communicationsAction, initial);
  return <form action={action} className="flex flex-wrap items-center gap-2"><input name="intent" type="hidden" value="move-shortcut" /><Revision record={record} />
    <Button variant="outline" name="direction" value="up" disabled={pending || first}>Move up</Button>
    <Button variant="outline" name="direction" value="down" disabled={pending || last}>Move down</Button>
    <Feedback state={state} />
  </form>;
}
