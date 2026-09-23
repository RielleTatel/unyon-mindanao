import "server-only";

import type { PrivateObjectStore } from "./contracts";

export function createR2Store(bucket: R2Bucket): PrivateObjectStore {
  return {
    async putIfAbsent(key, bytes, mimeType) {
      const result = await bucket.put(key, new Uint8Array(bytes), { httpMetadata: { contentType: mimeType }, onlyIf: { etagDoesNotMatch: "*" } });
      return result !== null;
    },
    async get(key) {
      const result = await bucket.get(key);
      if (!result) return null;
      if (result.size > 25 * 1024 * 1024) throw new Error("Object exceeds the portal file limit");
      return { bytes: new Uint8Array(await result.arrayBuffer()), mimeType: result.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) { await bucket.delete(key); },
  };
}
