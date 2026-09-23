import "server-only";

import type { PrivateObjectStore } from "./contracts";

export function createMemoryObjectStore(): PrivateObjectStore {
  const objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  return {
    async putIfAbsent(key, bytes, mimeType) { if (objects.has(key)) return false; objects.set(key, { bytes: bytes.slice(), mimeType }); return true; },
    async get(key) { const value = objects.get(key); return value ? { ...value, bytes: value.bytes.slice() } : null; },
    async delete(key) { objects.delete(key); },
  };
}
