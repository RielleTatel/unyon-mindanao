import "server-only";

const sensitiveKey =
  /(token|password|credential|birth(date|day)|dateofbirth|dob|evaluationcomment|comment|signedurl)/iu;

export function redactAuditMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (sensitiveKey.test(key.replaceAll(/[-_\s]/gu, ""))) {
        return [];
      }

      if (Array.isArray(value)) {
        return [
          [
            key,
            value.map((item) =>
              isRecord(item) ? redactAuditMetadata(item) : item,
            ),
          ],
        ];
      }

      if (isRecord(value)) {
        return [[key, redactAuditMetadata(value)]];
      }

      return [[key, value]];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
