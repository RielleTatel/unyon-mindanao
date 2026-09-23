import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createAccessPersistence, type PortalRole } from "@/features/access/server";
import { createPrivateFileFeature } from "@/features/private-files/server";
import { PrismaPrivateFileRepository } from "@/features/private-files/server/prisma-private-file-repository";
import { createFinancialReportFeature, PrismaFinancialReportRepository } from "@/features/financial-reports/server";
import { createMemoryObjectStore } from "@/platform/r2/memory-store";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Test database required");
const prisma = createPrismaClient(url); afterAll(() => prisma.$disconnect());
const store = createMemoryObjectStore();
const call = (input: unknown, sessionToken = "session") => ({ input, sessionToken, correlationId: randomUUID() });
const pdf = new TextEncoder().encode("%PDF-1.7\nlocal fixture\n%%EOF");
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
async function actor(role: PortalRole) {
  const university = role === "SUPER_ADMIN" ? null : await prisma.memberUniversity.create({ data: { name: randomUUID(), slug: randomUUID() } });
  const user = await prisma.portalUser.create({ data: { firebaseUid: randomUUID(), email: `${randomUUID()}@unyon.test`, fullName: "File Actor" } });
  const appointment = await prisma.appointment.create({ data: { portalUserId: user.id, role, universityId: university?.id, startsAt: new Date(Date.now() - 10000) } });
  const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await prisma.portalSession.create({ data: { portalUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + 300000) } });
  const { transactions } = createAccessPersistence(prisma, (transaction) => ({ files: new PrismaPrivateFileRepository(transaction), reports: new PrismaFinancialReportRepository(transaction) }));
  const sessions = { hashSessionToken: async () => tokenHash };
  return { user, university, appointment, files: createPrivateFileFeature({ transactions, sessions, store }), reports: createFinancialReportFeature({ transactions, sessions }) };
}
async function upload(files: Awaited<ReturnType<typeof actor>>["files"], purpose: string, resourceId: string, bytes = pdf, mimeType = "application/pdf") {
  const reservation = await files.reserve(call({ purpose, resourceId, size: bytes.length, mimeType }));
  await files.upload(call({ id: reservation.objectId, bytes, mimeType }));
  expect(await files.commit(call({ id: reservation.objectId }))).toEqual({ available: true });
  return reservation.objectId;
}
function grantInput(url: string) { const parsed = new URL(url, "http://localhost"); return { id: parsed.pathname.split("/")[3], expires: Number(parsed.searchParams.get("expires")), signature: parsed.searchParams.get("signature") }; }

describe("Private files and immutable Financial Reports", () => {
  it("reserves independent uploads concurrently without false serialization failures", async () => {
    const admin = await actor("SUPER_ADMIN");
    const reservations = await Promise.all(Array.from({ length: 8 }, () => admin.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: admin.user.id, size: png.length, mimeType: "image/png" }))));
    expect(new Set(reservations.map(({ objectId }) => objectId)).size).toBe(8);
  });
  it("stages PDFs privately, publishes and supersedes immutable revisions", async () => {
    const admin = await actor("SUPER_ADMIN"); const rep = await actor("REPRESENTATIVE");
    const { id } = await admin.reports.create(call({ title: "September report", reportingPeriod: "September 2026", description: "Local fixture" }));
    const report = (await admin.reports.list(call({}))).find((record) => record.id === id)!;
    const revisionId = report.revisions[0].id;
    await expect(admin.reports.publish(call({ id, revisionId }))).rejects.toMatchObject({ code: "CONFLICT" });
    const objectId = await upload(admin.files, "FINANCIAL_REPORT", revisionId);
    await expect(rep.files.authorizeDownload(call({ id: objectId }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect((await rep.reports.list(call({}))).some((record) => record.id === id)).toBe(false);
    await admin.reports.publish(call({ id, revisionId }));
    const grant = await rep.files.authorizeDownload(call({ id: objectId }));
    expect((await rep.files.download(call(grantInput(grant.url)))).bytes).toEqual(pdf);
    await expect(rep.files.download(call(grantInput(grant.url), "different-session"))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(admin.files.reserve(call({ purpose: "FINANCIAL_REPORT", resourceId: revisionId, size: pdf.length, mimeType: "application/pdf" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(prisma.financialReportRevision.update({ where: { id: revisionId }, data: { revision: 99 } })).rejects.toThrow();
    await admin.reports.revise(call({ id }));
    await expect(admin.reports.revise(call({ id }))).rejects.toMatchObject({ code: "CONFLICT" });
    const second = (await admin.reports.list(call({}))).find((record) => record.id === id)!.revisions[0];
    await upload(admin.files, "FINANCIAL_REPORT", second.id);
    await admin.reports.publish(call({ id, revisionId: second.id }));
    expect((await rep.reports.list(call({}))).find((record) => record.id === id)!.revisions.map(({ status }) => status)).toEqual(["PUBLISHED", "SUPERSEDED"]);
    expect((await rep.files.download(call(grantInput(grant.url)))).bytes).toEqual(pdf);
    await prisma.appointment.update({ where: { id: rep.appointment.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expect(rep.files.download(call(grantInput(grant.url)))).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("rejects wrong types, sizes, signatures, overwrites and missing staged bytes", async () => {
    const admin = await actor("SUPER_ADMIN");
    for (const input of [{ mimeType: "application/pdf", size: 20 }, { mimeType: "image/png", size: 5242881 }]) await expect(admin.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: admin.user.id, ...input }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const pending = await admin.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: admin.user.id, mimeType: "image/png", size: png.length }));
    await expect(admin.files.upload(call({ id: pending.objectId, mimeType: "image/png", bytes: new Uint8Array(png.length) }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await admin.files.upload(call({ id: pending.objectId, mimeType: "image/png", bytes: png }));
    await expect(admin.files.upload(call({ id: pending.objectId, mimeType: "image/png", bytes: png }))).rejects.toMatchObject({ code: "CONFLICT" });
    await admin.files.commit(call({ id: pending.objectId }));
    const missing = await admin.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: admin.user.id, mimeType: "image/png", size: png.length }));
    expect(await admin.files.commit(call({ id: missing.objectId }))).toEqual({ available: false });
    expect((await prisma.storedObject.findUniqueOrThrow({ where: { id: missing.objectId } })).status).toBe("FAILED");
    const expired = await admin.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: admin.user.id, mimeType: "image/png", size: png.length }));
    await admin.files.upload(call({ id: expired.objectId, mimeType: "image/png", bytes: png }));
    await prisma.storedObject.update({ where: { id: expired.objectId }, data: { expiresAt: new Date(0) } });
    await admin.files.cleanup(call({}));
    expect(await store.get(expired.objectId)).toBeNull();
    expect(await store.get(pending.objectId)).not.toBeNull();
    expect((await prisma.storedObject.findUniqueOrThrow({ where: { id: expired.objectId } })).cleanedAt).not.toBeNull();
  });
  it("denies non-admin reports and another person's profile mutations", async () => {
    const rep = await actor("REPRESENTATIVE"); const other = await actor("UNIVERSITY_ADMIN");
    await expect(rep.reports.create(call({ title: "Forbidden", reportingPeriod: "Now", description: "No" }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(other.files.reserve(call({ purpose: "PROFILE_IMAGE", resourceId: rep.user.id, mimeType: "image/png", size: png.length }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    const objectId = await upload(rep.files, "PROFILE_IMAGE", rep.user.id, png, "image/png");
    const grant = await other.files.authorizeDownload(call({ id: objectId }));
    await expect(other.files.download(call({ ...grantInput(grant.url), expires: Date.now() - 1 }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(other.files.download(call({ ...grantInput(grant.url), signature: "0".repeat(64) }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });
  it("allows only the owning University Admin to upload a cover, not a co-host", async () => {
    const owner = await actor("UNIVERSITY_ADMIN"); const cohost = await actor("UNIVERSITY_ADMIN"); const rep = await actor("REPRESENTATIVE");
    const event = await prisma.event.create({ data: { title: "Private cover", description: "Fixture", category: "Forum", startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), location: "Local", ownerUniversityId: owner.university!.id, createdByPortalUserId: owner.user.id, coHosts: { create: { universityId: cohost.university!.id } } } });
    const reserve = { purpose: "EVENT_COVER", resourceId: event.id, mimeType: "image/png", size: png.length };
    await expect(cohost.files.reserve(call(reserve))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    const objectId = await upload(owner.files, "EVENT_COVER", event.id, png, "image/png");
    await expect(rep.files.authorizeDownload(call({ id: objectId }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await prisma.event.update({ where: { id: event.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    const grant = await rep.files.authorizeDownload(call({ id: objectId }));
    expect((await rep.files.download(call(grantInput(grant.url)))).bytes).toEqual(png);
    await prisma.event.update({ where: { id: event.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await expect(rep.files.download(call(grantInput(grant.url)))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });
});
