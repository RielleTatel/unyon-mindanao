"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { privateFileAction } from "@/app/portal/files/actions";
import type { FilePurpose } from "../contracts";

export function PrivateImage({ objectId, alt }: { objectId: string; alt: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void privateFileAction("download", { id: objectId }).then((response) => {
      if (!cancelled && response.result && "url" in response.result) setSource(response.result.url);
    });
    return () => { cancelled = true; };
  }, [objectId]);
  // Private session-bound resources must bypass the public image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return source ? <img src={source} alt={alt} className="my-5 max-h-80 max-w-full object-contain" referrerPolicy="no-referrer" /> : <p className="text-sm text-muted-foreground">Image unavailable or loading.</p>;
}

export function FileUpload({ purpose, resourceId }: { purpose: FilePurpose; resourceId: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  return <form className="space-y-3 rounded-xl border p-4" onSubmit={(event) => {
    event.preventDefault(); const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) return;
    start(async () => {
      setMessage("");
      try {
        const reservation = await privateFileAction("reserve", { resourceId, purpose, mimeType: file.type, size: file.size });
        if (!reservation.result || !("uploadUrl" in reservation.result)) throw new Error();
        const response = await fetch(reservation.result.uploadUrl, { method: "PUT", headers: { "content-type": file.type, "x-unyon-upload": "1" }, body: file });
        if (!response.ok) throw new Error();
        const committed = await privateFileAction("commit", { id: reservation.result.objectId });
        if (!committed.result || !("available" in committed.result) || !committed.result.available) throw new Error();
        setMessage("File saved."); router.refresh();
      } catch { setMessage("Upload failed. Use an allowed file within the size limit and try again."); }
    });
  }}>
    <label className="block">{purpose === "FINANCIAL_REPORT" ? "PDF (up to 25 MB)" : "Image (JPEG, PNG or WebP, up to 5 MB)"}<input className="block max-w-full" name="file" type="file" required accept={purpose === "FINANCIAL_REPORT" ? "application/pdf" : "image/jpeg,image/png,image/webp"} /></label>
    <button disabled={pending} className="rounded border px-4 py-2">{pending ? "Uploading…" : "Upload file"}</button><p role="status">{message}</p>
  </form>;
}

export function PrivateFileLink({ objectId, label = "Download PDF" }: { objectId: string; label?: string }) {
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <span><button className="underline" disabled={pending} onClick={() => start(async () => {
    const response = await privateFileAction("download", { id: objectId });
    if (response.result && "url" in response.result) window.location.assign(response.result.url);
    else setMessage(response.error ?? "File unavailable");
  })}>{label}</button><span role="status">{message}</span></span>;
}
