import type { EventRecord } from "./contracts";

const allDayFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeZone: "Asia/Manila",
});
const timedFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
});
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit", month: "2-digit", timeZone: "Asia/Manila", year: "numeric",
});

export function formatEventRange(event: Pick<EventRecord, "allDay" | "startsAt" | "endsAt">) {
  const format = event.allDay ? allDayFormatter : timedFormatter;
  return `${format.format(new Date(event.startsAt))}${event.allDay ? " · all day" : ` – ${format.format(new Date(event.endsAt))}`}`;
}

export function manilaDateKey(isoDate: string) {
  const values = Object.fromEntries(dateKeyFormatter.formatToParts(new Date(isoDate)).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
