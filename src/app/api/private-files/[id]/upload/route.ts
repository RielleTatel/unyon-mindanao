import { cookies } from "next/headers";
import { sessionCookieName, withSessionService } from "@/features/access/server";
import { withPrivateFileFeature } from "@/features/private-files/server";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("x-unyon-upload") !== "1") return new Response(null, { status: 403 });
    const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
    await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 25 * 1024 * 1024) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const { id } = await context.params;
    await withPrivateFileFeature((feature) => feature.upload({ input: { id, bytes, mimeType: request.headers.get("content-type") ?? "" }, sessionToken, correlationId: crypto.randomUUID() }));
    return Response.json({ uploaded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Upload unavailable" }, { status: 400 }); }
}
