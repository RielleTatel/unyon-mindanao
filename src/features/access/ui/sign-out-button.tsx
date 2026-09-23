"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signOutPortalIdentity } from "../client/firebase-auth";
import { Button } from "@/shared/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);
    let serverRevoked = false;
    let firebaseSignedOut = false;

    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!csrfResponse.ok) {
        throw new Error("Unable to prepare sign-out");
      }
      const csrf = (await csrfResponse.json()) as { token?: string };

      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "same-origin",
        headers: { "x-csrf-token": csrf.token ?? "" },
        method: "DELETE",
      });

      if (!sessionResponse.ok) {
        throw new Error("Unable to revoke the portal session");
      }

      serverRevoked = true;
    } catch {
      setError("Sign-out could not be confirmed. Please try again.");
    }

    try {
      await signOutPortalIdentity();
      firebaseSignedOut = true;
    } catch {
      setError("Sign-out could not be confirmed. Please try again.");
    }

    if (serverRevoked && firebaseSignedOut) {
      router.push("/sign-in");
      router.refresh();
      return;
    }

    setPending(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button disabled={pending} onClick={signOut} variant="outline">
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? (
        <p className="m-0 max-w-64 text-right text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
