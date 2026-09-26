import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, type PortalRole } from "@/features/access/server";
import { createEvaluationFeature, PrismaEvaluationRepository } from "@/features/evaluations/server";
import { createPrismaClient } from "@/platform/database/client";
config({ path: ".env.local", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Test database required");
const prisma = createPrismaClient(url); afterAll(() => prisma.$disconnect());
const call = (input: unknown) => ({ input, sessionToken: "session", correlationId: randomUUID() });
async function actor(role: PortalRole, universityId?: string, startsAt = new Date(Date.now() - 86400000)) {
  if (role !== "SUPER_ADMIN" && !universityId) universityId = (await prisma.memberUniversity.create({ data: { name: randomUUID(), slug: randomUUID() } })).id;
  const user = await prisma.portalUser.create({ data: { firebaseUid: randomUUID(), email: `${randomUUID()}@unyon.test`, fullName: "Evaluation Actor" } });
  const appointment = await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId, startsAt } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 300000) } });
  const { transactions } = createAccessPersistence(prisma, (transaction) => ({ evaluations: new PrismaEvaluationRepository(transaction) }));
  return { user, appointment, universityId, feature: createEvaluationFeature({ transactions, sessions: { hashSessionToken: async () => tokenHash } }) };
}
async function event(creatorId: string, ownerUniversityId?: string, initialTemplate = true) {
  const record = await prisma.event.create({ data: { title: "Completed prototype Event", description: "Fixture", category: "Assembly", startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000), location: "Local", status: "DRAFT", ownerUniversityId, createdByPortalUserId: creatorId } });
  if (initialTemplate) await prisma.eventEvaluationWindow.create({ data: { eventId: record.id, templateId: "b0000000-0000-4000-8000-000000000001", opensAt: record.endsAt, closesAt: new Date(record.endsAt.getTime() + 7 * 86400000) } });
  return prisma.event.update({ where: { id: record.id }, data: { status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000) } });
}
const answers = [{ position: 0, rating: 4, comment: null }, { position: 1, rating: 5, comment: null }, { position: 2, rating: null, comment: "=HYPERLINK(\"https://example.org\")" }];

describe("Event Evaluation privacy and windows", () => {
  it("removes identifiable responses after two calendar years and audits only a count", async () => {
    const admin = await actor("SUPER_ADMIN"); const oldUser = await actor("REPRESENTATIVE"); const recentUser = await actor("REPRESENTATIVE");
    const record = await event(admin.user.id);
    const old = await prisma.evaluationResponse.create({ data: { eventId: record.id, portalUserId: oldUser.user.id, submittedAt: new Date("2022-01-01T00:00:00Z"), answers: { create: answers } } });
    const recent = await prisma.evaluationResponse.create({ data: { eventId: record.id, portalUserId: recentUser.user.id, submittedAt: new Date(), answers: { create: answers } } });
    await expect(oldUser.feature.expireResponses(call({}))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(await admin.feature.expireResponses(call({}))).toEqual({ removed: 1 });
    expect(await prisma.evaluationResponse.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.evaluationAnswer.count({ where: { responseId: old.id } })).toBe(0);
    expect(await prisma.evaluationResponse.findUnique({ where: { id: recent.id } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "evaluation.responses_expired", actorPortalUserId: admin.user.id }, orderBy: { occurredAt: "desc" } })).toMatchObject({ metadata: { removedCount: 1 } });
  });
  it("enforces eligibility, one response, optimistic editing and closed/cancelled windows", async () => {
    const admin = await actor("SUPER_ADMIN"); const rep = await actor("REPRESENTATIVE"); const late = await actor("REPRESENTATIVE", undefined, new Date(Date.now() - 1000));
    const record = await event(admin.user.id);
    expect((await rep.feature.list(call({}))).find(({ eventId }) => eventId === record.id)?.canRespond).toBe(true);
    await expect(late.feature.submit(call({ id: record.id, version: 0, answers }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(rep.feature.submit(call({ id: record.id, version: 0, answers: answers.slice(1) }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await rep.feature.submit(call({ id: record.id, version: 0, answers }));
    await expect(rep.feature.submit(call({ id: record.id, version: 0, answers }))).rejects.toMatchObject({ code: "CONFLICT" });
    await rep.feature.submit(call({ id: record.id, version: 1, answers }));
    await expect(rep.feature.submit(call({ id: record.id, version: 1, answers }))).rejects.toMatchObject({ code: "CONFLICT" });
    await admin.feature.updateWindow(call({ id: record.id, version: 1, closed: true, closesAt: new Date(Date.now() + 86400000).toISOString() }));
    await expect(rep.feature.submit(call({ id: record.id, version: 2, answers }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await admin.feature.updateWindow(call({ id: record.id, version: 2, closed: false, closesAt: new Date(Date.now() + 86400000).toISOString() }));
    await rep.feature.submit(call({ id: record.id, version: 2, answers }));
    await prisma.event.update({ where: { id: record.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await expect(rep.feature.submit(call({ id: record.id, version: 3, answers }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await prisma.appointment.update({ where: { id: rep.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expect(rep.feature.list(call({}))).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("withholds counts and comments below five, denies co-hosts, and exports the same disclosure", async () => {
    const admin = await actor("SUPER_ADMIN"); const owner = await actor("UNIVERSITY_ADMIN"); const cohost = await actor("UNIVERSITY_ADMIN");
    const record = await event(admin.user.id, owner.universityId);
    await prisma.eventCoHost.create({ data: { eventId: record.id, universityId: cohost.universityId! } });
    const representatives = [];
    for (let index = 0; index < 5; index++) representatives.push(await actor("REPRESENTATIVE"));
    for (const rep of representatives.slice(0, 4)) await rep.feature.submit(call({ id: record.id, version: 0, answers }));
    expect(await owner.feature.results(call({ id: record.id }))).toEqual({ disclosure: "WITHHELD" });
    await expect(owner.feature.exportCsv(call({ id: record.id }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(cohost.feature.results(call({ id: record.id }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(cohost.feature.results(call({ id: randomUUID() }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await representatives[4].feature.submit(call({ id: record.id, version: 0, answers }));
    const anonymous = await owner.feature.results(call({ id: record.id }));
    expect(anonymous).toMatchObject({ disclosure: "ANONYMOUS", count: 5, responses: [], ratings: [{ position: 0, average: 4 }, { position: 1, average: 5 }] });
    expect(JSON.stringify(anonymous)).not.toContain(representatives[0].user.email);
    const csv = await owner.feature.exportCsv(call({ id: record.id }));
    expect(csv).toContain("'=HYPERLINK"); expect(csv).not.toContain("Email");
    const attributable = await admin.feature.results(call({ id: record.id }));
    expect(attributable).toMatchObject({ disclosure: "ATTRIBUTABLE", count: 5 });
    expect(JSON.stringify(attributable)).toContain(representatives[0].user.email);
    expect(await admin.feature.exportCsv(call({ id: record.id }))).toContain(representatives[0].user.email);
  });
  it("snapshots immutable templates so new versions do not change existing Events", async () => {
    const admin = await actor("SUPER_ADMIN"); const record = await event(admin.user.id);
    const before = (await admin.feature.list(call({}))).find(({ eventId }) => eventId === record.id)!;
    await admin.feature.createTemplate(call({ questions: [{ label: "A new rating", kind: "RATING" }] }));
    const after = (await admin.feature.list(call({}))).find(({ eventId }) => eventId === record.id)!;
    expect(after.questions).toEqual(before.questions); expect(after.templateVersion).toBe(before.templateVersion);
    await expect(prisma.eventEvaluationWindow.update({ where: { eventId: record.id }, data: { templateId: (await admin.feature.templates(call({})))[0].id } })).rejects.toThrow();
    const next = await event(admin.user.id, undefined, false);
    expect((await admin.feature.list(call({}))).find(({ eventId }) => eventId === next.id)!.questions).toEqual([{ label: "A new rating", kind: "RATING" }]);
    const template = (await admin.feature.templates(call({})))[0];
    await expect(prisma.evaluationTemplateVersion.update({ where: { id: template.id }, data: { questions: [] } })).rejects.toThrow();
  });
});
