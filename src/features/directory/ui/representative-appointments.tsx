"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { endRepresentativeAppointment } from "@/app/portal/team/actions";
import { signInWithPortalIdentity } from "@/features/access/client/firebase-auth";
import type { RepresentativeAppointmentRecord } from "../contracts";

export function RepresentativeAppointments({ appointments, actorEmail }: { appointments: RepresentativeAppointmentRecord[]; actorEmail: string }) {
  return <section className="mt-8" aria-labelledby="representative-appointments">
    <h2 className="font-serif text-3xl" id="representative-appointments">Representative Appointments</h2>
    <p className="text-sm text-muted-foreground">End an outgoing officer’s Appointment to remove its authority immediately. Their history stays in the portal.</p>
    {appointments.length === 0 ? <p>No Representative Appointments yet.</p> : <ul className="grid list-none gap-4 p-0">
      {appointments.map((appointment) => <li className="rounded-2xl border border-primary/15 bg-card p-5" key={appointment.id}>
        <h3 className="m-0 text-lg font-bold">{appointment.fullName}</h3>
        <p className="my-2 break-all text-sm">{appointment.email} · {appointment.universityName}</p>
        <p className="text-sm text-muted-foreground">{appointment.active ? "Active" : "Inactive"} · Started {formatDate(appointment.startsAt)}{appointment.endsAt ? ` · Ends ${formatDate(appointment.endsAt)}` : ""}</p>
        {appointment.active ? <EndAppointment id={appointment.id} actorEmail={actorEmail} /> : null}
      </li>)}
    </ul>}
  </section>;
}

function EndAppointment({ id, actorEmail }: { id: string; actorEmail: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setPending(true);
    setError("");
    try {
      const idToken = await signInWithPortalIdentity(actorEmail, password);
      const result = await endRepresentativeAppointment({ id, idToken });
      if (result.error) setError(result.error);
      else { form.reset(); router.refresh(); }
    } catch {
      setError("Password confirmation failed. Try again.");
    } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
    <input autoComplete="username" type="hidden" value={actorEmail} />
    <label className="text-sm font-semibold">Confirm your password<input autoComplete="current-password" className="mt-1 block min-h-11 rounded-xl border border-primary/20 px-3 focus-visible:ring-2 focus-visible:ring-ring" name="password" required type="password" disabled={pending} /></label>
    <button className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" disabled={pending} type="submit">{pending ? "Ending…" : "End Appointment"}</button>
    {error ? <p className="w-full text-sm text-destructive" role="alert">{error}</p> : null}
  </form>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}
