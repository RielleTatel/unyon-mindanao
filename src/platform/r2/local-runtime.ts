import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrivateObjectStore } from "./contracts";

export function createPrivateObjectStore(): PrivateObjectStore {
  if (process.env.APP_ENV !== "local") throw new Error("Filesystem private storage is local-only; use the R2 Worker runtime");
  const root = path.join(process.cwd(), ".local-private-files");
  function filename(key: string) {
    if (!/^[a-f0-9-]{36}$/u.test(key)) throw new Error("Invalid server object key");
    return path.join(root, key);
  }
  return {
    async putIfAbsent(key, bytes, mimeType) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      try {
        // Keep metadata and bytes in one exclusively-created private file.
        await writeFile(filename(key), Buffer.concat([Buffer.from(`${mimeType}\n`), bytes]), { flag: "wx", mode: 0o600 });
        return true;
      } catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "EEXIST") return false; throw error; }
    },
    async get(key) {
      try {
        const content = await readFile(filename(key));
        const end = content.indexOf(10);
        if (end < 0 || content.length > 25 * 1024 * 1024 + 101) throw new Error("Invalid private object");
        return { mimeType: content.subarray(0, end).toString(), bytes: new Uint8Array(content.subarray(end + 1)) };
      } catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") return null; throw error; }
    },
    async delete(key) {
      try { await unlink(filename(key)); }
      catch (error) { if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) throw error; }
    },
  };
}
