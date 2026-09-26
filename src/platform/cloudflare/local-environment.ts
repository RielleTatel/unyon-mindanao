import "server-only";

export function getWorkerEnvironment(): never {
  throw new Error("Cloudflare bindings are available only in the Workers runtime");
}
