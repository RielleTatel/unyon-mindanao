"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  AccessError,
  sessionCookieName,
} from "@/features/access/server";
import { withMemberUniversityFeature } from "@/features/directory/server";

export interface MemberUniversityActionState {
  error: string | null;
  message: string | null;
}

export async function memberUniversityAction(
  _previousState: MemberUniversityActionState,
  formData: FormData,
): Promise<MemberUniversityActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = formText(formData, "intent");
  const id = formText(formData, "id");

  try {
    const input = {
      name: formText(formData, "name"),
      slug: formText(formData, "slug"),
      description: formText(formData, "description"),
    };

    if (intent === "create") {
      await withMemberUniversityFeature((feature) =>
        feature.create({ correlationId, input, sessionToken }),
      );
    } else if (intent === "update") {
      await withMemberUniversityFeature((feature) =>
        feature.update({
          correlationId,
          input: { ...input, id },
          sessionToken,
        }),
      );
    } else if (intent === "archive") {
      await withMemberUniversityFeature((feature) =>
        feature.archive({ correlationId, input: { id }, sessionToken }),
      );
    } else if (intent === "restore") {
      await withMemberUniversityFeature((feature) =>
        feature.restore({ correlationId, input: { id }, sessionToken }),
      );
    } else {
      return { error: "That request could not be completed.", message: null };
    }
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") {
        return {
          error: "Enter a name and a valid URL slug.",
          message: null,
        };
      }

      if (error.code === "CONFLICT") {
        return {
          error: "A Member University with that name or slug already exists.",
          message: null,
        };
      }

      if (error.code === "NOT_FOUND_OR_FORBIDDEN") {
        return {
          error: "That Member University could not be changed.",
          message: null,
        };
      }

      if (error.code === "AUTHENTICATION_REQUIRED") {
        return { error: "Your session has expired. Sign in again.", message: null };
      }
    }

    return {
      error: "The Member University could not be saved. Try again.",
      message: null,
    };
  }

  revalidatePath("/portal/universities");
  return { error: null, message: messageFor(intent) };
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function messageFor(intent: string) {
  switch (intent) {
    case "create":
      return "Member University created.";
    case "update":
      return "Member University details saved.";
    case "archive":
      return "Member University archived.";
    case "restore":
      return "Member University restored.";
    default:
      return "Changes saved.";
  }
}
