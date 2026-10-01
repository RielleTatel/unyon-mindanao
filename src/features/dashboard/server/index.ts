import "server-only";
import { withEventFeature } from "@/features/events/server";
import { withBirthdayFeature } from "@/features/directory/server";
import { withCommunicationsFeature } from "@/features/communications/server";
import { withEvaluationFeature } from "@/features/evaluations/server";

export async function loadDashboard(sessionToken: string) {
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "numeric" }).format(new Date()));
  const [events, announcements, birthdays, evaluations] = await Promise.all([
    withEventFeature((feature) => feature.upcomingSummaries(request({}))),
    withCommunicationsFeature((feature) => feature.recentAnnouncements(request({}))),
    withBirthdayFeature((feature) => feature.list(request({ month }))),
    withEvaluationFeature((feature) => feature.openSummaries(request({}))),
  ]);
  return {
    events,
    announcements,
    birthdays: birthdays.map(({ portalUserId, fullName, day }) => ({ portalUserId, fullName, day })),
    evaluations,
  };
}
