import "server-only";

import { z } from "zod";

import type {
  IdentityVerifier,
  PortalActor,
  SessionRepository,
  SessionTokens,
} from "./contracts";
import {
  AccessError,
  authenticationRequired,
  operationFailed,
} from "./errors";

const fiveDaysInSeconds = 60 * 60 * 24 * 5;
const recentAuthenticationWindowMs = 5 * 60 * 1000;

const startSessionInput = z.object({
  idToken: z.string().min(1),
  csrfToken: z.string().min(16),
  csrfCookieToken: z.string().min(16),
  correlationId: z.string().min(1),
});

export interface SessionService {
  start(input: {
    idToken: string;
    csrfToken: string;
    csrfCookieToken: string;
    correlationId: string;
  }): Promise<{ actor: PortalActor; expiresAt: Date; sessionToken: string }>;
  require(sessionToken: string, correlationId: string): Promise<PortalActor>;
  hashSessionToken(sessionToken: string): Promise<string>;
  end(sessionToken: string, correlationId: string): Promise<void>;
}

export function createSessionService(dependencies: {
  identityVerifier: IdentityVerifier;
  repository: SessionRepository;
  tokens: SessionTokens;
  now?: () => Date;
  reportFailure?: (stage: string, error: unknown) => void;
}): SessionService {
  const now = dependencies.now ?? (() => new Date());

  async function hashSessionToken(sessionToken: string) {
    if (!sessionToken) {
      throw authenticationRequired();
    }

    try {
      return await dependencies.tokens.hash(sessionToken);
    } catch (error) {
      dependencies.reportFailure?.("session_token_hash", error);
      throw authenticationRequired();
    }
  }

  return {
    hashSessionToken,

    async start(rawInput) {
      const parsed = startSessionInput.safeParse(rawInput);

      if (!parsed.success) {
        throw authenticationRequired();
      }

      if (!constantTimeEqual(parsed.data.csrfToken, parsed.data.csrfCookieToken)) {
        throw authenticationRequired();
      }

      let identity;

      try {
        identity = await dependencies.identityVerifier.verifyIdToken(
          parsed.data.idToken,
        );
      } catch (error) {
        dependencies.reportFailure?.("identity_verification", error);
        throw authenticationRequired();
      }

      if (!identity.emailVerified) {
        throw authenticationRequired();
      }

      const authenticationAge =
        now().getTime() - identity.authenticatedAt.getTime();

      if (
        authenticationAge < 0 ||
        authenticationAge > recentAuthenticationWindowMs
      ) {
        throw new AccessError(
          "RECENT_AUTHENTICATION_REQUIRED",
          "Recent authentication required",
        );
      }

      let sessionToken: string;
      let tokenHash: string;

      try {
        sessionToken = dependencies.tokens.create();
        tokenHash = await dependencies.tokens.hash(sessionToken);
      } catch (error) {
        dependencies.reportFailure?.("session_token", error);
        throw authenticationRequired();
      }

      try {
        const started = await dependencies.repository.start({
          correlationId: parsed.data.correlationId,
          identity,
          maximumLifetimeSeconds: fiveDaysInSeconds,
          tokenHash,
        });

        if (!started) {
          throw authenticationRequired();
        }

        return {
          actor: started.actor,
          expiresAt: started.expiresAt,
          sessionToken,
        };
      } catch (error) {
        if (error instanceof AccessError) {
          throw error;
        }

        dependencies.reportFailure?.("session_repository", error);
        throw authenticationRequired();
      }
    },

    async require(sessionToken, correlationId) {
      if (!sessionToken || !correlationId) {
        throw authenticationRequired();
      }

      try {
        const tokenHash = await hashSessionToken(sessionToken);
        const resolved = await dependencies.repository.resolve({
          correlationId,
          tokenHash,
        });

        if (!resolved) {
          throw authenticationRequired();
        }

        return resolved;
      } catch (error) {
        if (error instanceof AccessError) {
          throw error;
        }

        dependencies.reportFailure?.("session_resolve_dependency", error);
        throw authenticationRequired();
      }
    },

    async end(sessionToken, correlationId) {
      if (!sessionToken) {
        return;
      }

      try {
        await dependencies.repository.end({
          correlationId,
          tokenHash: await dependencies.tokens.hash(sessionToken),
        });
      } catch (error) {
        if (error instanceof AccessError) {
          throw error;
        }

        dependencies.reportFailure?.("session_end_dependency", error);
        throw operationFailed();
      }
    },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const maximumLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maximumLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
