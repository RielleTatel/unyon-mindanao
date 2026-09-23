"use client";
import { useActionState } from "react";
import { eventAction } from "@/app/portal/events/actions";
import type { EventRecord } from "../contracts";
export function EventDetailsForm({ event }: { event: EventRecord }) {
  const [state, action, pending] = useActionState(eventAction, { error: null, message: null });
  return <details className="mt-6 border-t py-4"><summary className="cursor-pointer font-semibold">Edit Event details</summary><form action={action} className="mt-4 grid gap-4"><input type="hidden" name="intent" value="edit" /><input type="hidden" name="id" value={event.id} /><input type="hidden" name="version" value={event.version} />
    <label>Event title<input className="block w-full border p-2" name="title" required minLength={3} maxLength={180} defaultValue={event.title} /></label><label>Description<textarea className="block w-full border p-2" name="description" required maxLength={5000} defaultValue={event.description} /></label><label>Physical venue<input className="block w-full border p-2" name="location" maxLength={300} defaultValue={event.location ?? ""} /></label><label>Online link<input className="block w-full border p-2" name="onlineUrl" type="url" maxLength={2000} defaultValue={event.onlineUrl ?? ""} /></label><label>Contact person<input className="block w-full border p-2" name="contactPerson" maxLength={160} defaultValue={event.contactPerson ?? ""} /></label><p className="text-sm text-muted-foreground">Ownership, schedule and Evaluation snapshots remain unchanged.</p><button disabled={pending} className="w-fit border px-4 py-2">Save Event details</button>{state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
  </form></details>;
}
