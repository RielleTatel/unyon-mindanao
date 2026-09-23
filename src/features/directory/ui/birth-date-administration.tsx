"use client";

import { useState, type FormEvent } from "react";
import { birthdayAction } from "@/app/portal/birthdays/actions";
import { signInWithPortalIdentity } from "@/features/access/client/firebase-auth";
import type { BirthDateSubject, RestrictedBirthDate } from "../contracts";
import { Button } from "@/shared/ui/button";

const fieldClass = "mt-1 block min-h-11 w-full rounded-xl border border-primary/25 bg-background px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring";

export function BirthDateAdministration({ people, actorEmail, canApplyRetention }: { people: BirthDateSubject[]; actorEmail: string; canApplyRetention: boolean }) {
  const [record, setRecord] = useState<RestrictedBirthDate | null>(null);
  const [selected, setSelected] = useState(people[0]?.id ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") as "read" | "update" | "retention";
    setPending(true); setError(""); setMessage("");
    try {
      const idToken = await signInWithPortalIdentity(actorEmail, String(data.get("password") ?? ""));
      const result = await birthdayAction({ action, id: selected, idToken, version: record?.version, birthDate: String(data.get("birthDate") ?? "") || null });
      if (result.error) { setRecord(null); setError(result.error); }
      else if (result.record) setRecord(result.record);
      else { setRecord(null); setMessage(result.message ?? "Saved."); }
    } catch { setRecord(null); setError("Password confirmation failed. Try again."); }
    finally { setPending(false); }
  }

  return <section className="mt-10 rounded-3xl border border-primary/20 bg-card p-6" aria-labelledby="birth-date-administration">
    <h2 id="birth-date-administration" className="mt-0 font-serif text-3xl">Manage birth dates</h2>
    <p className="text-sm text-muted-foreground">Full dates are restricted to authorized administrators. Every read and change is audited.</p>
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <label className="text-sm font-semibold">Portal User<select aria-label="Portal User" className={fieldClass} value={selected} disabled={pending} onChange={(event) => { setSelected(event.target.value); setRecord(null); setError(""); setMessage(""); }}>
        {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}{person.status === "DISABLED" ? " (disabled)" : ""}</option>)}
      </select></label>
      <label className="text-sm font-semibold">Confirm your password<input autoComplete="current-password" className={fieldClass} name="password" required type="password" disabled={pending} /></label>
      <div><Button disabled={pending || !selected} name="intent" value="read" type="submit">View full birth date</Button></div>
      {record && record.id === selected ? <div className="grid gap-3 rounded-xl bg-muted p-4">
        <label className="text-sm font-semibold">Full birth date<input className={fieldClass} defaultValue={record.birthDate ?? ""} key={`${record.id}-${record.version}`} name="birthDate" type="date" /></label>
        <p className="m-0 text-xs text-muted-foreground">Leave blank to remove the stored birth date.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={pending} name="intent" type="submit" value="update">Save birth date</Button><Button type="button" variant="outline" onClick={() => setRecord(null)}>Hide full date</Button></div>
      </div> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-primary">{message}</p> : null}
      {canApplyRetention ? <details className="mt-4 border-t border-primary/15 pt-4">
        <summary className="cursor-pointer text-sm font-bold">Birth-date retention</summary>
        <p className="text-sm text-muted-foreground">Remove stored birth dates one year after the final Appointment ends. Active, recently ended, and future Appointments protect the record. This removal cannot be undone here.</p>
        <Button disabled={pending} name="intent" value="retention" type="submit" variant="outline">Remove expired birth dates</Button>
      </details> : null}
    </form>
  </section>;
}
