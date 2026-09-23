import "server-only";

export type PortalRole =
  | "SUPER_ADMIN"
  | "UNIVERSITY_ADMIN"
  | "REPRESENTATIVE";

export interface ActiveAppointment {
  id: string;
  role: PortalRole;
  universityId: string | null;
}

export interface PortalActor {
  portalUserId: string;
  firebaseUid: string;
  email: string;
  appointments: ActiveAppointment[];
}

export interface VerifiedIdentity {
  signInProvider?: string;
  firebaseUid: string;
  email: string;
  emailVerified: boolean;
  authenticatedAt: Date;
}

export interface IdentityVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedIdentity>;
}

export interface SessionStartRecord {
  actor: PortalActor;
  expiresAt: Date;
}

export interface SessionRepository {
  start(input: {
    identity: VerifiedIdentity;
    tokenHash: string;
    maximumLifetimeSeconds: number;
    correlationId: string;
  }): Promise<SessionStartRecord | null>;
  resolve(input: {
    tokenHash: string;
    correlationId: string;
  }): Promise<PortalActor | null>;
  end(input: { tokenHash: string; correlationId: string }): Promise<void>;
}

export interface SessionTokens {
  create(): string;
  hash(value: string): Promise<string>;
}

export interface AuditRecord {
  action: string;
  actorPortalUserId: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  resourceId: string;
  resourceType: string;
}

export interface ProtectedTransaction<
  Capabilities extends object = Record<string, never>,
> {
  appendAudit(record: AuditRecord): Promise<void>;
  capabilities: Capabilities;
  occurredAt: Date;
}

export interface TransactionRunner<
  Capabilities extends object = Record<string, never>,
> {
  run<Result>(
    input: { correlationId: string; tokenHash: string },
    work: (
      transaction: ProtectedTransaction<Capabilities>,
      actor: PortalActor,
    ) => Promise<Result>,
  ): Promise<Result>;
}

export interface ResourceSubject {
  kind: string;
  id: string;
}
