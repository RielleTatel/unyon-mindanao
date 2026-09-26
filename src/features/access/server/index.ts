import "server-only";
export { withAuditHistory, createAuditHistoryFeature, PrismaAuditHistoryRepository } from "./audit-history";
export { verifyRecentPasswordForSession } from "./recent-password-runtime";
export { retryDatabaseTransactions } from "./retry-database-transactions";

export { requireRecentPassword } from "./recent-password";

export { redactAuditMetadata } from "./audit";
export {
  createSuperAdminBootstrap,
  type SuperAdminBootstrapRepository,
} from "./bootstrap";
export type {
  ActiveAppointment,
  AuditRecord,
  IdentityVerifier,
  PortalActor,
  PortalRole,
  ProtectedTransaction,
  ResourceSubject,
  SessionRepository,
  SessionStartRecord,
  SessionTokens,
  TransactionRunner,
  VerifiedIdentity,
} from "./contracts";
export { AccessError, type AccessErrorCode } from "./errors";
export {
  createCsrfToken,
  csrfCookieName,
  secureCookie,
  sessionCookieName,
} from "./cookies";
export {
  createAccessPersistence,
  type AccessPersistence,
} from "./persistence";
export { createD1AccessPersistence } from "./d1-persistence";
export { createProtectedOperationFactory } from "./protected-operation";
export { withAccessRuntime, withSessionService } from "./runtime";
export {
  createSessionService,
  type SessionService,
} from "./session-service";
