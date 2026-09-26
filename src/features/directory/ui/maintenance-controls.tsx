"use client";
import { useState, useTransition } from "react";
import { maintenanceAction } from "@/app/portal/accounts/maintenance-actions";
import { signInWithPortalIdentity } from "@/features/access/client/firebase-auth";
export function MaintenanceControls({ email }: { email: string }) {
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <form className="space-y-3 border-t py-6" onSubmit={(event) => {
    event.preventDefault(); const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    start(async () => { try { const token = await signInWithPortalIdentity(email, password); setMessage((await maintenanceAction(token)).message); form.reset(); } catch { setMessage("Password confirmation failed."); } });
  }}><h2 className="text-2xl">Retention and staged file cleanup</h2><p className="text-sm text-muted-foreground">Removes birth dates one year after the final Appointment, identifiable Evaluation responses after two years, and expired or failed staged files. Historical Appointments, published files and audit records remain.</p><label className="block text-sm">Confirm your password<input className="mt-2 block border p-2" name="password" type="password" autoComplete="current-password" required /></label><button disabled={pending} className="border px-4 py-2">Run authorized maintenance</button><p role="status">{message}</p></form>;
}
