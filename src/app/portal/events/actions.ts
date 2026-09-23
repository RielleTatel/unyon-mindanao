"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withEventFeature } from "@/features/events/server";

export interface EventActionState {
  error: string | null;
  message: string | null;
}

export async function eventAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const correlationId = crypto.randomUUID();
  const intent = formText(formData, "intent");

  try {
    await withEventFeature(async (feature) => {
      if (intent === "create") {
        await feature.create({
          correlationId,
          input: {
            allDay: formData.get("allDay") === "on",
            category: formText(formData, "category"),
            coHostUniversityIds: formData.getAll("coHostUniversityIds").filter(isString),
            contactPerson: formText(formData, "contactPerson"),
            description: formText(formData, "description"),
            endsAt: manilaDateTimeToIso(formText(formData, "endsAt")),
            eventId: crypto.randomUUID(),
            location: formText(formData, "location"),
            onlineUrl: formText(formData, "onlineUrl"),
            ownerUniversityId: formText(formData, "ownerUniversityId") || null,
            startsAt: manilaDateTimeToIso(formText(formData, "startsAt")),
            title: formText(formData, "title"),
          },
          sessionToken,
        });
      } else if (intent === "edit") {
        await feature.edit({ correlationId, sessionToken, input: { id: formText(formData, "id"), version: Number(formText(formData, "version")), title: formText(formData, "title"), description: formText(formData, "description"), location: formText(formData, "location"), onlineUrl: formText(formData, "onlineUrl"), contactPerson: formText(formData, "contactPerson") } });
      } else if (["publish", "cancel", "complete", "archive"].includes(intent)) {
        const request = {
          correlationId,
          input: {
            id: formText(formData, "id"),
            version: Number(formText(formData, "version")),
          },
          sessionToken,
        };

        if (intent === "publish") await feature.publish(request);
        if (intent === "cancel") await feature.cancel(request);
        if (intent === "complete") await feature.complete(request);
        if (intent === "archive") await feature.archive(request);
      } else {
        throw new AccessError("INVALID_INPUT", "Invalid event action");
      }
    });
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "INVALID_INPUT") {
        return { error: "Check the event details and try again.", message: null };
      }
      if (error.code === "NOT_FOUND_OR_FORBIDDEN") {
        return { error: "That event could not be changed.", message: null };
      }
      if (error.code === "AUTHENTICATION_REQUIRED") {
        return { error: "Your session has expired. Sign in again.", message: null };
      }
      if (error.code === "CONFLICT") {
        return { error: error.message, message: null };
      }
    }

    return { error: "The event could not be saved. Try again.", message: null };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/events");
  revalidatePath(`/portal/events/${formText(formData, "id")}`);
  const successMessage: Record<string, string> = {
    archive: "Event archived.",
    cancel: "Event cancelled.",
    complete: "Event marked complete.",
    create: "Draft saved. Review it, then publish when ready.",
    publish: "Event published.",
  };
  return {
    error: null,
    message: successMessage[intent] ?? "Event updated.",
  };
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function isString(value: FormDataEntryValue): value is string {
  return typeof value === "string";
}

function manilaDateTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return value;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
