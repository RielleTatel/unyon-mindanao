"use client";

import { useActionState } from "react";

import { representativeInvitationAction } from "@/app/portal/team/actions";
import type { InvitationActionState } from "@/app/portal/universities/invitation-actions";
import type { MemberUniversityRecord, UniversityAdminInvitationRecord } from "../contracts";

const initialState: InvitationActionState = { error: null, message: null };
const inputClass = "mt-1 block min-h-11 w-full rounded-xl border border-primary/20 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60";

export function RepresentativeAccess({
  invitations,
  universities,
}: {
  invitations: UniversityAdminInvitationRecord[];
  universities: Array<Pick<MemberUniversityRecord, "id" | "name">>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {universities.map((university) => (
        <UniversityTeamCard
          invitations={invitations.filter(({ universityId }) => universityId === university.id)}
          key={university.id}
          university={university}
        />
      ))}
      {universities.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/25 p-6 text-sm text-muted-foreground">No active Member University is connected to your current Appointment.</p> : null}
    </div>
  );
}

function UniversityTeamCard({
  invitations,
  university,
}: {
  invitations: UniversityAdminInvitationRecord[];
  university: Pick<MemberUniversityRecord, "id" | "name">;
}) {
  const [state, formAction, isPending] = useActionState(representativeInvitationAction, initialState);

  return (
    <section className="rounded-3xl border border-primary/15 bg-card p-5 shadow-[0_14px_40px_rgba(24,59,44,0.05)] sm:p-7">
      <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Member University</p>
      <h2 className="mt-2 mb-0 font-serif text-2xl font-medium">{university.name}</h2>
      <p className="mt-3 mb-5 text-sm leading-6 text-muted-foreground">Invite officers to view published events and submit eligible evaluations. Their access ends with their Appointment.</p>
      <form action={formAction} className="grid gap-3 border-b border-primary/10 pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input name="intent" type="hidden" value="invite" />
        <input name="universityId" type="hidden" value={university.id} />
        <label className="block text-sm font-semibold">Representative email<input autoComplete="email" className={inputClass} maxLength={320} name="email" placeholder="officer@university.edu" required type="email" /></label>
        <button className={`${buttonClass} self-end`} disabled={isPending} type="submit">{isPending ? "Sending…" : "Invite Representative"}</button>
        <div className="sm:col-span-2">
          {state.error ? <p className="m-0 text-sm font-semibold text-destructive" role="alert">{state.error}</p> : null}
          {state.message ? <p className="m-0 text-sm font-semibold text-primary" role="status">{state.message}</p> : null}
        </div>
      </form>
      <div className="pt-5">
        <h3 className="m-0 text-sm font-bold">Pending invitations</h3>
        {invitations.length === 0 ? <p className="mt-2 mb-0 text-sm text-muted-foreground">No pending Representative invitations.</p> : (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {invitations.map((invitation) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/70 px-3 py-3" key={invitation.id}>
              <div><p className="m-0 break-all text-sm font-semibold">{invitation.email}</p><p className="mt-1 mb-0 text-xs text-muted-foreground">Expires {new Date(invitation.expiresAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p></div>
              <RevokeInvitation id={invitation.id} />
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

function RevokeInvitation({ id }: { id: string }) {
  const [state, formAction, isPending] = useActionState(representativeInvitationAction, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="intent" type="hidden" value="revoke" /><input name="id" type="hidden" value={id} />
      <button className="inline-flex min-h-9 items-center justify-center rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary hover:bg-card focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" disabled={isPending} type="submit">{isPending ? "Revoking…" : "Revoke"}</button>
      {state.error ? <p className="m-0 text-xs text-destructive" role="alert">{state.error}</p> : null}
    </form>
  );
}
