"use client";
import { useState, useTransition } from "react";
import { accountAction } from "@/app/portal/accounts/actions";
import { signInWithPortalIdentity } from "@/features/access/client/firebase-auth";
export function AccountControl({ id, status, email }: { id: string; status?: "ACTIVE" | "DISABLED"; email: string }) {
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => {
    event.preventDefault(); const form = event.currentTarget; const password = String(new FormData(form).get("password") ?? "");
    start(async () => { try { const idToken = await signInWithPortalIdentity(email, password); const response = await accountAction(status ? "status" : "end", { id, idToken, status: status === "ACTIVE" ? "DISABLED" : "ACTIVE" }); setMessage(response.message); form.reset(); } catch { setMessage("Password confirmation failed."); } });
  }}><label className="text-sm">Confirm your password<input name="password" type="password" autoComplete="current-password" required className="block border p-2" /></label><button disabled={pending} className="border px-4 py-2">{status ? status === "ACTIVE" ? "Disable account" : "Restore account" : "End University Admin Appointment"}</button><p role="status" className="text-sm">{message}</p></form>;
}
