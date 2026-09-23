import "server-only";

import { env } from "cloudflare:workers";
import { createR2Store } from "./r2-store";

export function createPrivateObjectStore() {
  const bucket = (env as unknown as { PRIVATE_FILES: R2Bucket }).PRIVATE_FILES;
  if (!bucket) throw new Error("The private R2 binding is required");
  return createR2Store(bucket);
}
