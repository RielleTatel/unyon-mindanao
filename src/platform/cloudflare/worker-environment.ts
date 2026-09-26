import "server-only";

import { env } from "cloudflare:workers";

export function getWorkerEnvironment() {
  return env;
}
