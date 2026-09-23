"use client";

import { useActionState } from "react";

import { memberUniversityAction } from "@/app/portal/universities/actions";
import { universityAdminInvitationAction } from "@/app/portal/universities/invitation-actions";
import type {
  MemberUniversityRecord,
  UniversityAdminInvitationRecord,
} from "../contracts";

const initialState = { error: null, message: null };
const inputClassName =
  "mt-1 block min-h-11 w-full rounded-xl border border-primary/20 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60";

export function MemberUniversityAdmin({
  invitations,
  universities,
}: {
  invitations: UniversityAdminInvitationRecord[];
  universities: MemberUniversityRecord[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(17rem,0.75fr)_minmax(0,1.25fr)]">
      <section className="h-fit rounded-3xl border border-primary/15 bg-card p-6 shadow-[0_14px_40px_rgba(24,59,44,0.07)] sm:p-8">
        <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
          New directory entry
        </p>
        <h2 className="mt-3 mb-6 font-serif text-3xl font-medium tracking-[-0.03em]">
          Add a Member University
        </h2>
        <UniversityForm intent="create" submitLabel="Create university" />
      </section>

      <section aria-labelledby="directory-list-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
              Confederation directory
            </p>
            <h2
              className="mt-2 mb-0 font-serif text-3xl font-medium tracking-[-0.03em]"
              id="directory-list-title"
            >
              Member Universities
            </h2>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            {universities.filter(({ status }) => status === "ACTIVE").length} active
          </span>
        </div>

        {universities.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary/25 bg-card/70 px-6 py-12 text-center">
            <p className="m-0 text-sm text-muted-foreground">
              No Member Universities yet. Add the first directory entry to begin.
            </p>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {universities.map((university) => (
              <li key={university.id}>
                <UniversityCard
                  invitations={invitations.filter(
                    (invitation) => invitation.universityId === university.id,
                  )}
                  university={university}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UniversityForm({
  intent,
  submitLabel,
  university,
}: {
  intent: "create" | "update";
  submitLabel: string;
  university?: MemberUniversityRecord;
}) {
  const [state, formAction, isPending] = useActionState(
    memberUniversityAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input name="intent" type="hidden" value={intent} />
      {university ? <input name="id" type="hidden" value={university.id} /> : null}
      <label className="block text-sm font-semibold">
        Member University name
        <input
          autoComplete="organization"
          className={inputClassName}
          defaultValue={university?.name}
          maxLength={180}
          minLength={2}
          name="name"
          required
        />
      </label>
      <label className="block text-sm font-semibold">
        URL slug <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          autoCapitalize="none"
          className={inputClassName}
          defaultValue={university?.slug}
          maxLength={160}
          name="slug"
          placeholder="generated-from-name"
        />
      </label>
      <label className="block text-sm font-semibold">
        Description <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          className={`${inputClassName} min-h-24 resize-y`}
          defaultValue={university?.description ?? ""}
          maxLength={1000}
          name="description"
          rows={3}
        />
      </label>
      <ActionFeedback error={state.error} message={state.message} />
      <button className={buttonClassName} disabled={isPending} type="submit">
        {isPending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function UniversityCard({
  invitations,
  university,
}: {
  invitations: UniversityAdminInvitationRecord[];
  university: MemberUniversityRecord;
}) {
  const [state, formAction, isPending] = useActionState(
    memberUniversityAction,
    initialState,
  );
  const isActive = university.status === "ACTIVE";

  return (
    <article className="rounded-3xl border border-primary/15 bg-card p-5 shadow-[0_14px_40px_rgba(24,59,44,0.06)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-bold">{university.name}</h3>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">/{university.slug}</p>
        </div>
        <span
          className={
            isActive
              ? "rounded-full bg-[#e7efdc] px-3 py-1 text-xs font-bold text-primary"
              : "rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
          }
        >
          {isActive ? "Active" : "Archived"}
        </span>
      </div>

      {isActive ? (
        <>
          <UniversityForm
            intent="update"
            submitLabel="Save changes"
            university={university}
          />
          <form action={formAction} className="mt-3 border-t border-primary/10 pt-4">
            <input name="intent" type="hidden" value="archive" />
            <input name="id" type="hidden" value={university.id} />
            <ActionFeedback error={state.error} message={state.message} />
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving…" : "Archive"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            This entry is archived and excluded from active directory choices.
            {university.description ? ` ${university.description}` : ""}
          </p>
          <form action={formAction}>
            <input name="intent" type="hidden" value="restore" />
            <input name="id" type="hidden" value={university.id} />
            <ActionFeedback error={state.error} message={state.message} />
            <button
              className={buttonClassName}
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving…" : "Restore"}
            </button>
          </form>
        </>
      )}

      <InvitationPanel invitations={invitations} university={university} />
    </article>
  );
}

function InvitationPanel({
  invitations,
  university,
}: {
  invitations: UniversityAdminInvitationRecord[];
  university: MemberUniversityRecord;
}) {
  return (
    <section className="mt-6 border-t border-primary/10 pt-5" aria-label={`University Admin invitations for ${university.name}`}>
      <p className="m-0 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">
        University Admin access
      </p>
      {university.status === "ACTIVE" ? (
        <InvitationForm universityId={university.id} />
      ) : (
        <p className="mt-3 mb-0 text-sm text-muted-foreground">
          Restore this Member University before sending an invitation.
        </p>
      )}

      <div className="mt-5">
        <h4 className="m-0 text-sm font-bold">Pending invitations</h4>
        {invitations.length === 0 ? (
          <p className="mt-2 mb-0 text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <ul className="mt-3 grid list-none gap-2 p-0">
            {invitations.map((invitation) => (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/70 px-3 py-3" key={invitation.id}>
                <div>
                  <p className="m-0 break-all text-sm font-semibold">{invitation.email}</p>
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    Expires {formatExpiry(invitation.expiresAt)}
                  </p>
                </div>
                <RevokeInvitationForm invitationId={invitation.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InvitationForm({ universityId }: { universityId: string }) {
  const [state, formAction, isPending] = useActionState(
    universityAdminInvitationAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input name="intent" type="hidden" value="invite" />
      <input name="universityId" type="hidden" value={universityId} />
      <label className="block text-sm font-semibold">
        Email address
        <input
          autoComplete="email"
          className={inputClassName}
          maxLength={320}
          name="email"
          placeholder="admin@university.edu"
          required
          type="email"
        />
      </label>
      <button className={`${buttonClassName} self-end`} disabled={isPending} type="submit">
        {isPending ? "Sending…" : "Invite Admin"}
      </button>
      <div className="sm:col-span-2">
        <ActionFeedback error={state.error} message={state.message} />
      </div>
    </form>
  );
}

function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, formAction, isPending] = useActionState(
    universityAdminInvitationAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="intent" type="hidden" value="revoke" />
      <input name="id" type="hidden" value={invitationId} />
      <ActionFeedback error={state.error} message={state.message} />
      <button
        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary hover:bg-card focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Revoking…" : "Revoke"}
      </button>
    </form>
  );
}

function formatExpiry(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

function ActionFeedback({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  if (error) {
    return (
      <p className="m-0 text-sm font-semibold text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (message) {
    return (
      <p className="m-0 text-sm font-semibold text-primary" role="status">
        {message}
      </p>
    );
  }

  return null;
}
