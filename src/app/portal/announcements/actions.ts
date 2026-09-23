"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withCommunicationsFeature } from "@/features/communications/server";

export interface CommunicationsActionState { error: string | null; message: string | null }
export async function communicationsAction(_previous: CommunicationsActionState, form: FormData): Promise<CommunicationsActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const text = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const id = text("id") || undefined;
  const version = text("version") ? Number(text("version")) : undefined;
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  try {
    await withCommunicationsFeature(async (feature) => {
      switch (text("intent")) {
        case "save-announcement": return feature.saveAnnouncement(request({ id, version, title: text("title"), body: text("body") }));
        case "transition-announcement": return feature.transitionAnnouncement(request({ id, version, status: text("status") }));
        case "save-shortcut": return feature.saveShortcut(request({ id, version, label: text("label"), url: text("url"), icon: text("icon") || null, active: form.get("active") === "on" }));
        case "reorder-shortcuts": return feature.reorderShortcuts(request({ ids: JSON.parse(text("ids")) }));
        default: throw new AccessError("INVALID_INPUT", "Invalid action");
      }
    });
  } catch (error) {
    if (error instanceof AccessError && error.code === "CONFLICT") return { error: "This content changed. Refresh and try again.", message: null };
    if (error instanceof AccessError && error.code === "INVALID_INPUT") return { error: "Check the fields. Shortcuts require an http or https URL without credentials.", message: null };
    return { error: "This change could not be saved. Check your access and try again.", message: null };
  }
  revalidatePath("/portal/announcements"); revalidatePath("/portal/shortcuts"); revalidatePath("/portal");
  return { error: null, message: "Changes saved." };
}
