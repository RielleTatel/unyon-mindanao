import "server-only";

export interface PrivateObjectStore {
  putIfAbsent(key: string, bytes: Uint8Array, mimeType: string): Promise<boolean>;
  get(key: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}
