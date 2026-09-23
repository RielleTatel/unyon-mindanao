import "server-only";

export type AccessErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "RECENT_AUTHENTICATION_REQUIRED"
  | "NOT_FOUND_OR_FORBIDDEN"
  | "INVALID_INPUT"
  | "INVALID_INVITATION"
  | "INVITATION_EMAIL_MISMATCH"
  | "CONFLICT"
  | "OPERATION_FAILED";

export class AccessError extends Error {
  readonly code: AccessErrorCode;

  constructor(code: AccessErrorCode, message: string) {
    super(message);
    this.name = "AccessError";
    this.code = code;
  }
}

export function authenticationRequired(): AccessError {
  return new AccessError("AUTHENTICATION_REQUIRED", "Authentication required");
}

export function operationFailed(): AccessError {
  return new AccessError(
    "OPERATION_FAILED",
    "The operation could not be completed",
  );
}
