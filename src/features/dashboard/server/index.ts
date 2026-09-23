import "server-only";
import { withEventFeature } from "@/features/events/server";
import { withBirthdayFeature } from "@/features/directory/server";
import { withCommunicationsFeature } from "@/features/communications/server";
import { withEvaluationFeature } from "@/features/evaluations/server";

export async function loadDashboard(sessionToken: string) {
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "numeric" }).format(new Date()));
  const [events, announcements, birthdays, evaluations] = await Promise.all([
    withEventFeature((feature) => feature.list(request({ includeArchived: false, upcomingOnly: true, search: "" }))),
    withCommunicationsFeature((feature) => feature.listAnnouncements(request({}))),
    withBirthdayFeature((feature) => feature.list(request({ month }))),
    withEvaluationFeature((feature) => feature.list(request({}))),
  ]);
  return {
    events: events.filter(({ status }) => status === "PUBLISHED").slice(0, 4),
    announcements: announcements.filter(({ status }) => status === "PUBLISHED").slice(0, 3).map(({ id, title, body }) => ({ id, title, excerpt: body.slice(0, 220) })),
    birthdays: birthdays.map(({ portalUserId, fullName, day }) => ({ portalUserId, fullName, day })),
    evaluations: evaluations.filter(({ canRespond }) => canRespond).map(({ eventId, title, closesAt, response }) => ({ eventId, title, closesAt, submitted: response !== null })),
  };
}
