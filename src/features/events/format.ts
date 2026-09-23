import type { EventRecord } from "./contracts";

export function formatEventRange(event: Pick<EventRecord, "allDay" | "startsAt" | "endsAt">) {
  const format = new Intl.DateTimeFormat("en-PH", {
    ...(event.allDay
      ? { dateStyle: "medium" as const }
      : { dateStyle: "medium" as const, timeStyle: "short" as const }),
    timeZone: "Asia/Manila",
  });
  return `${format.format(new Date(event.startsAt))}${event.allDay ? " · all day" : ` – ${format.format(new Date(event.endsAt))}`}`;
}
