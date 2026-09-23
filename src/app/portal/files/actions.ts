"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionCookieName } from "@/features/access/server";
import { withPrivateFileFeature } from "@/features/private-files/server";

export async function privateFileAction(intent: "reserve" | "commit" | "download", input: unknown) {
  const request = { input, sessionToken: (await cookies()).get(sessionCookieName)?.value ?? "", correlationId: crypto.randomUUID() };
  try {
    const result = await withPrivateFileFeature(async (feature) => {
      if (intent === "reserve") return feature.reserve(request);
      if (intent === "commit") return feature.commit(request);
      if (intent === "download") return feature.authorizeDownload(request);
      throw new Error("Invalid intent");
    });
    if (intent === "commit") revalidatePath("/portal", "layout");
    return { result, error: null };
  } catch (error) {
    console.warn(JSON.stringify({ event: "private_file_action_failed", intent, code: typeof error === "object" && error && "code" in error ? String(error.code) : "OPERATION_FAILED" }));
    return { result: null, error: "File unavailable. Check your access, file type and size, then try again." };
  }
}
