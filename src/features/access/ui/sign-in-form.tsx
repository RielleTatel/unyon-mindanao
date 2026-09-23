"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  signInWithPortalIdentity,
  signOutPortalIdentity,
} from "../client/firebase-auth";
import { Button } from "@/shared/ui/button";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const data = new FormData(event.currentTarget);

    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const csrf = (await csrfResponse.json()) as { token?: string };

      if (!csrfResponse.ok || !csrf.token) {
        throw new Error("CSRF initialization failed");
      }

      const idToken = await signInWithPortalIdentity(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      const sessionResponse = await fetch("/api/auth/session", {
        body: JSON.stringify({ idToken }),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.token,
        },
        method: "POST",
      });

      if (!sessionResponse.ok) {
        setError(
          "Sign-in was not accepted. Check your account details or contact an administrator.",
        );
        setSubmitting(false);

        try {
          await signOutPortalIdentity();
        } catch {
          // Portal access is already denied; Firebase cleanup can be retried.
        }

        return;
      }

      router.push("/portal");
      router.refresh();
    } catch {
      setError(
        "Sign-in was not accepted. Check your account details or contact an administrator.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-semibold" htmlFor="email">
        Email address
        <input
          autoComplete="email"
          className="min-h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/40"
          id="email"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold" htmlFor="password">
        Password
        <input
          autoComplete="current-password"
          className="min-h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/40"
          id="password"
          minLength={6}
          name="password"
          required
          type="password"
        />
      </label>
      {error ? (
        <p
          className="m-0 rounded-xl border border-red-800/20 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button className="mt-1 w-full" disabled={submitting} type="submit">
        {submitting ? "Signing in…" : "Sign in securely"}
      </Button>
    </form>
  );
}
