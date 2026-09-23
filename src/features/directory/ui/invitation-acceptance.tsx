"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createPortalIdentityForInvitation,
  signInForInvitation,
} from "@/features/access/client/firebase-auth";
import type { InvitationPreview } from "../contracts";

type Mode = "create" | "sign-in";

export function InvitationAcceptance() {
  const router = useRouter();
  const [token] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  );
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      void Promise.resolve().then(() =>
        setError("This invitation link is invalid or expired."),
      );
      return;
    }

    void fetch("/api/invitations/preview", {
      body: JSON.stringify({ token }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Invitation unavailable");
        }

        return (await response.json()) as InvitationPreview;
      })
      .then(setPreview)
      .catch(() => setError("This invitation link is invalid or expired."));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const fullName = String(data.get("fullName") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const continueUrl = window.location.href;

    try {
      if (!preview || !token) {
        throw new Error("Invitation unavailable");
      }

      if (mode === "create") {
        await createPortalIdentityForInvitation(preview.email, password, continueUrl);
        setMessage("Check your email and verify your address. Return to this page, then sign in to finish accepting your invitation.");
        setMode("sign-in");
        setSubmitting(false);
        return;
      }

      const identity = await signInForInvitation(preview.email, password, continueUrl);

      if (!identity.emailVerified) {
        setMessage("Your email is not verified yet. We sent another verification link.");
        setSubmitting(false);
        return;
      }

      const csrfResponse = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const csrf = (await csrfResponse.json()) as { token?: string };

      if (!csrfResponse.ok || !csrf.token) {
        throw new Error("CSRF initialization failed");
      }

      const acceptResponse = await fetch("/api/invitations/accept", {
        body: JSON.stringify({ fullName, idToken: identity.idToken, token }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.token,
        },
        method: "POST",
      });

      if (!acceptResponse.ok) {
        const result = (await acceptResponse.json()) as { error?: string };

        if (result.error === "INVITATION_EMAIL_MISMATCH") {
          throw new Error("Sign in with the verified email address shown above.");
        }

        if (result.error === "INVALID_INVITATION") {
          throw new Error("This invitation link is invalid, expired, revoked, or already used.");
        }

        if (result.error === "CONFLICT") {
          throw new Error("This account already has an appointment that conflicts with the invitation. Contact a Super Admin.");
        }

        throw new Error("Your invitation could not be accepted. Try again or contact a Super Admin.");
      }

      router.replace("/portal");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your invitation could not be accepted. Check your details and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-primary/15 bg-card p-6 shadow-[0_16px_48px_rgba(24,59,44,0.08)] sm:p-10">
        <Link className="text-sm font-bold text-primary underline-offset-4 hover:underline" href="/sign-in">
          ← Sign in
        </Link>
        <p className="mt-8 mb-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
          Private portal access
        </p>
        <h1 className="mt-3 mb-0 font-serif text-4xl font-medium tracking-[-0.04em]">
          Accept your invitation
        </h1>

        {preview ? (
          <>
            <p className="mt-4 mb-0 text-sm leading-6 text-muted-foreground">
              You are invited as a <strong className="text-foreground">{preview.role === "REPRESENTATIVE" ? "Representative" : "University Admin"}</strong> for <strong className="text-foreground">{preview.universityName}</strong>.
              This link expires {new Date(preview.expiresAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}.
            </p>
            <form className="mt-7 grid gap-4" onSubmit={submit}>
              <label className="grid gap-2 text-sm font-semibold" htmlFor="invited-email">
                Invitation email
                <input
                  autoComplete="email"
                  className="min-h-12 rounded-xl border border-border bg-muted px-4 text-base text-foreground"
                  id="invited-email"
                  readOnly
                  value={preview.email}
                />
              </label>
              {mode === "create" ? (
                <label className="grid gap-2 text-sm font-semibold" htmlFor="full-name">
                  Full name
                  <input
                    autoComplete="name"
                    className="min-h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="full-name"
                    maxLength={160}
                    minLength={2}
                    name="fullName"
                    required
                  />
                </label>
              ) : (
                <label className="grid gap-2 text-sm font-semibold" htmlFor="full-name">
                  Full name
                  <input
                    autoComplete="name"
                    className="min-h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="full-name"
                    maxLength={160}
                    minLength={2}
                    name="fullName"
                    required
                  />
                </label>
              )}
              <label className="grid gap-2 text-sm font-semibold" htmlFor="password">
                Password
                <input
                  autoComplete={mode === "create" ? "new-password" : "current-password"}
                  className="min-h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  id="password"
                  minLength={6}
                  name="password"
                  required
                  type="password"
                />
              </label>
              {error ? <p className="m-0 text-sm font-semibold text-destructive" role="alert">{error}</p> : null}
              {message ? <p className="m-0 text-sm font-semibold text-primary" role="status">{message}</p> : null}
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "create"
                    ? "Create account and verify email"
                    : "Sign in and accept invitation"}
              </button>
            </form>
            <button
              className="mt-4 min-h-10 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setError("");
                setMessage("");
                setMode(mode === "create" ? "sign-in" : "create");
              }}
              type="button"
            >
              {mode === "create" ? "Already have an account? Sign in" : "Need to create an account?"}
            </button>
          </>
        ) : error ? (
          <p className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground" role="status">Checking invitation…</p>
        )}
      </section>
    </main>
  );
}
