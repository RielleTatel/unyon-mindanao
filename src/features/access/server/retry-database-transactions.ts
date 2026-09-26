import "server-only";
import type { TransactionRunner } from "./contracts";

/** Opt in only for operations whose effects are entirely rolled back with PostgreSQL. */
export function retryDatabaseTransactions<Capabilities extends object>(runner: TransactionRunner<Capabilities>): TransactionRunner<Capabilities> {
  return { async run(input, work) {
    for (let attempt = 0; ; attempt++) {
      try { return await runner.run(input, work); }
      catch (error) {
        const conflict = typeof error === "object" && error !== null && (("code" in error && error.code === "P2034") || ("cause" in error && typeof error.cause === "object" && error.cause !== null && "originalCode" in error.cause && error.cause.originalCode === "40001"));
        if (!conflict || attempt >= 8) throw error;
        const ceiling = Math.min(500, 40 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * ceiling)));
      }
    }
  } };
}
