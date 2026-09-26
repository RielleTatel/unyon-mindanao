import "server-only";

import { z } from "zod";
import { AccessError, createProtectedOperationFactory, retryDatabaseTransactions, type PortalActor, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { PrivateObjectStore } from "@/platform/r2/contracts";
import type { FilePurpose } from "../contracts";

export interface FileSubject {
  purpose: FilePurpose; resourceId: string; objectId: string | null;
  ownerUniversityId: string | null; status: string; activeProfile: boolean;
}
export interface StoredFile {
  id: string; key: string; purpose: FilePurpose; resourceId: string; uploaderId: string;
  mimeType: string; size: number; sha256: string | null; status: "PENDING" | "AVAILABLE" | "FAILED"; expiresAt: Date;
}
export interface PrivateFileRepository {
  subject(purpose: FilePurpose, id: string, now: Date): Promise<FileSubject | null>;
  get(id: string): Promise<StoredFile | null>;
  reserve(input: StoredFile): Promise<void>;
  pendingCount(uploaderId: string, now: Date): Promise<number>;
  commit(object: StoredFile, sha256: string): Promise<void>;
  fail(id: string): Promise<void>;
  expired(now: Date): Promise<StoredFile[]>;
  markCleaned(id: string, now: Date): Promise<void>;
}

const idInput = z.object({ id: z.string().uuid() });
type Request = { input: unknown; sessionToken: string; correlationId: string };
const forbidden = () => new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden");

export function createPrivateFileFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ files: PrivateFileRepository }>; store: PrivateObjectStore }) {
  const factory = createProtectedOperationFactory(dependencies);
  const databaseFactory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  const claimExpired = factory.mutation({
    intent: "private-file.cleanup.claim", action: "private_files.cleanup_claimed", input: z.object({}),
    resolveSubject: async () => ({ id: "expired-uploads", kind: "StoredObjectDirectory" }),
    authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN"),
    execute: async ({ transaction, occurredAt }) => {
      const objects = await transaction.capabilities.files.expired(occurredAt);
      for (const object of objects) await transaction.capabilities.files.fail(object.id);
      return objects;
    },
    auditMetadata: (objects) => ({ count: objects.length }),
  });
  const finishCleanup = factory.mutation({
    intent: "private-file.cleanup.finish", action: "private_file.cleaned", input: idInput,
    resolveSubject: async ({ transaction }, input) => {
      const file = await transaction.capabilities.files.get(input.id);
      return file?.status === "FAILED" ? { id: file.id, kind: "StoredObject" } : null;
    },
    authorize: ({ actor }) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN"),
    execute: async ({ transaction, subject, occurredAt }) => { await transaction.capabilities.files.markCleaned(subject.id, occurredAt); return { cleaned: true }; },
  });
  const resolveFile = async (transaction: { capabilities: { files: PrivateFileRepository } }, now: Date, id: string) => {
    const file = await transaction.capabilities.files.get(id);
    if (!file) return null;
    const resource = await transaction.capabilities.files.subject(file.purpose, file.resourceId, now);
    return resource ? { id: file.id, kind: "StoredObject", file, resource } : null;
  };
  const authorizeDownload = factory.query({
    intent: "private-file.download.authorize", input: idInput,
    resolveSubject: ({ transaction, occurredAt }, input) => resolveFile(transaction, occurredAt, input.id),
    authorize: ({ actor, subject }) => subject.file.status === "AVAILABLE" && subject.resource.objectId === subject.file.id && canRead(actor, subject.resource),
    execute: async ({ subject, occurredAt }) => ({ id: subject.file.id, expires: occurredAt.getTime() + 60_000 }),
  });
  const download = factory.query({
    intent: "private-file.download", input: idInput.extend({ expires: z.number().int(), signature: z.string().regex(/^[a-f0-9]{64}$/u), sessionKey: z.string().min(1) }),
    resolveSubject: ({ transaction, occurredAt }, input) => resolveFile(transaction, occurredAt, input.id),
    authorize: ({ actor, subject }) => subject.file.status === "AVAILABLE" && subject.resource.objectId === subject.file.id && canRead(actor, subject.resource),
    execute: async ({ subject, occurredAt }, input) => {
      if (input.expires <= occurredAt.getTime() || input.expires > occurredAt.getTime() + 60_000 || !await verifySignature(input.sessionKey, `${input.id}:${input.expires}`, input.signature)) throw forbidden();
      const object = await dependencies.store.get(subject.file.key);
      if (!object || object.bytes.length !== subject.file.size || await sha256(object.bytes) !== subject.file.sha256) throw forbidden();
      return { bytes: object.bytes, mimeType: subject.file.mimeType };
    },
  });
  return {
    reserve: databaseFactory.mutation({
      intent: "private-file.reserve", action: "private_file.reserved",
      input: z.object({ purpose: z.enum(["PROFILE_IMAGE", "EVENT_COVER", "FINANCIAL_REPORT"]), resourceId: z.string().uuid(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), size: z.number().int().positive().max(25 * 1024 * 1024) }),
      resolveSubject: async ({ transaction, occurredAt }, input) => {
        const resource = await transaction.capabilities.files.subject(input.purpose, input.resourceId, occurredAt);
        return resource ? { id: crypto.randomUUID(), kind: "StoredObject", resource } : null;
      },
      authorize: ({ actor, subject }) => canWrite(actor, subject.resource),
      execute: async ({ actor, subject, transaction, occurredAt }, input) => {
        if ((input.purpose === "FINANCIAL_REPORT") !== (input.mimeType === "application/pdf") || (input.purpose !== "FINANCIAL_REPORT" && input.size > 5 * 1024 * 1024)) throw new AccessError("INVALID_INPUT", "Invalid file type or size");
        if (await transaction.capabilities.files.pendingCount(actor.portalUserId, occurredAt) >= 10) throw new AccessError("CONFLICT", "Too many pending uploads");
        const expiresAt = new Date(occurredAt.getTime() + 10 * 60_000);
        await transaction.capabilities.files.reserve({ ...input, id: subject.id, key: subject.id, uploaderId: actor.portalUserId, expiresAt, status: "PENDING", sha256: null });
        return { objectId: subject.id, uploadUrl: `/api/private-files/${subject.id}/upload`, expiresAt: expiresAt.toISOString() };
      },
      auditMetadata: (_result, input) => ({ purpose: input.purpose, size: input.size }),
    }),
    upload: factory.mutation({
      intent: "private-file.upload", action: "private_file.uploaded", input: idInput.extend({ bytes: z.instanceof(Uint8Array), mimeType: z.string() }),
      resolveSubject: ({ transaction, occurredAt }, input) => resolveFile(transaction, occurredAt, input.id),
      authorize: ({ actor, subject }) => subject.file.uploaderId === actor.portalUserId && canWrite(actor, subject.resource),
      execute: async ({ subject, occurredAt }, input) => {
        if (subject.file.status !== "PENDING" || subject.file.expiresAt <= occurredAt) throw new AccessError("CONFLICT", "Upload is no longer pending");
        if (input.bytes.length !== subject.file.size || input.mimeType !== subject.file.mimeType || !validSignature(input.bytes, input.mimeType)) throw new AccessError("INVALID_INPUT", "Invalid file contents");
        if (!await dependencies.store.putIfAbsent(subject.file.key, input.bytes, input.mimeType)) {
          const existing = await dependencies.store.get(subject.file.key);
          if (!existing || existing.mimeType !== input.mimeType || existing.bytes.length !== input.bytes.length || await sha256(existing.bytes) !== await sha256(input.bytes)) throw new AccessError("CONFLICT", "This reservation already has different bytes");
        }
        return { uploaded: true };
      },
    }),
    commit: databaseFactory.mutation({
      intent: "private-file.commit", action: "private_file.committed", input: idInput,
      resolveSubject: ({ transaction, occurredAt }, input) => resolveFile(transaction, occurredAt, input.id),
      authorize: ({ actor, subject }) => subject.file.uploaderId === actor.portalUserId && canWrite(actor, subject.resource),
      execute: async ({ subject, transaction, occurredAt }) => {
        if (subject.file.status !== "PENDING" || subject.file.expiresAt <= occurredAt) throw new AccessError("CONFLICT", "Upload is no longer pending");
        const object = await dependencies.store.get(subject.file.key);
        if (!object || object.bytes.length !== subject.file.size || object.mimeType !== subject.file.mimeType || !validSignature(object.bytes, object.mimeType)) {
          await transaction.capabilities.files.fail(subject.file.id);
          // Cleanup removes failed bytes after this database transaction commits.
          // Keeping external writes out of commit makes serialization retries safe.
          return { available: false };
        }
        await transaction.capabilities.files.commit(subject.file, await sha256(object.bytes));
        return { available: true };
      },
      auditMetadata: (result) => ({ available: result.available }),
    }),
    async authorizeDownload(request: Request) {
      const result = await authorizeDownload(request);
      const signature = await sign(request.sessionToken, `${result.id}:${result.expires}`);
      return { url: `/api/private-files/${result.id}/download?expires=${result.expires}&signature=${signature}`, expiresAt: new Date(result.expires).toISOString() };
    },
    download(request: Request) {
      const input = typeof request.input === "object" && request.input !== null ? request.input : {};
      return download({ ...request, input: { ...input, sessionKey: request.sessionToken } });
    },
    async cleanup(request: Request) {
      const objects = await claimExpired(request);
      for (const object of objects) {
        try { await dependencies.store.delete(object.key); }
        catch { throw new AccessError("OPERATION_FAILED", "Cleanup can be retried"); }
        await finishCleanup({ ...request, input: { id: object.id } });
      }
      return { removed: objects.length };
    },
  };
}

function canWrite(actor: PortalActor, subject: FileSubject) {
  const superAdmin = actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
  if (subject.purpose === "PROFILE_IMAGE") return subject.resourceId === actor.portalUserId || superAdmin;
  if (subject.purpose === "FINANCIAL_REPORT") return superAdmin && subject.status === "DRAFT";
  return subject.status !== "ARCHIVED" && (superAdmin || actor.appointments.some(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId === subject.ownerUniversityId));
}
function canRead(actor: PortalActor, subject: FileSubject) {
  if (actor.appointments.some(({ role }) => role === "SUPER_ADMIN")) return true;
  if (subject.purpose === "PROFILE_IMAGE") return subject.activeProfile || subject.resourceId === actor.portalUserId;
  if (subject.purpose === "FINANCIAL_REPORT") return subject.status === "PUBLISHED" || subject.status === "SUPERSEDED";
  return subject.status === "PUBLISHED" || canWrite(actor, subject);
}

export function validSignature(bytes: Uint8Array, mimeType: string) {
  const starts = (prefix: number[], offset = 0) => prefix.every((value, index) => bytes[offset + index] === value);
  if (mimeType === "image/png") return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mimeType === "image/jpeg") return starts([255, 216, 255]);
  if (mimeType === "image/webp") return starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8);
  if (mimeType === "application/pdf") return starts([37, 80, 68, 70, 45]);
  return false;
}
async function sha256(bytes: Uint8Array) { return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))); }
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function signingKey(secret: string) { return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
async function sign(secret: string, value: string) { return hex(await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(value))); }
async function verifySignature(secret: string, value: string, signature: string) { return crypto.subtle.verify("HMAC", await signingKey(secret), Uint8Array.from(signature.match(/../gu)!, (byte) => Number.parseInt(byte, 16)), new TextEncoder().encode(value)); }
