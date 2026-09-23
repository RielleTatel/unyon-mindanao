import { cookies } from "next/headers";
import { sessionCookieName } from "@/features/access/server";
import { withPrivateFileFeature } from "@/features/private-files/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
    const input = { id: (await context.params).id, expires: Number(url.searchParams.get("expires")), signature: url.searchParams.get("signature") };
    const file = await withPrivateFileFeature((feature) => feature.download({ input, sessionToken, correlationId: crypto.randomUUID() }));
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Disposition": file.mimeType === "application/pdf" ? 'attachment; filename="financial-report.pdf"' : "inline" } });
  } catch { return new Response("File unavailable", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
