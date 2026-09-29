"use client";

import { useId, useRef, useState } from "react";

import type { IssuedInvitationLinkDetails } from "../contracts";
import { invitationCopy } from "../invitation-copy";

export function IssuedInvitationLink({ issued }: { issued: IssuedInvitationLinkDetails }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const roleName = issued.role === "UNIVERSITY_ADMIN" ? invitationCopy.universityAdmin : invitationCopy.representative;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopyStatus(invitationCopy.copied);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyStatus(invitationCopy.copyUnavailable);
    }
  }

  return (
    <section aria-label={invitationCopy.linkRegion} className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:col-span-2">
      <p className="m-0 text-sm font-bold text-primary">{invitationCopy.linkCreated}</p>
      <p className="mt-2 mb-0 break-all text-sm text-foreground">
        {roleName} · {issued.universityName} · {issued.email}
      </p>
      <p className="mt-1 mb-0 text-xs text-muted-foreground">
        {invitationCopy.expires} {new Date(issued.expiresAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}
      </p>
      <label className="mt-4 block text-sm font-semibold" htmlFor={inputId}>{invitationCopy.linkLabel}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-primary/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={inputId}
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={issued.url}
        />
        <button
          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void copyLink()}
          type="button"
        >
          {invitationCopy.copyButton}
        </button>
      </div>
      <p className="mt-2 mb-0 text-xs text-muted-foreground">{invitationCopy.linkShareHint}</p>
      <p aria-live="polite" className="mt-2 mb-0 text-sm font-semibold text-primary" role="status">{copyStatus}</p>
    </section>
  );
}
