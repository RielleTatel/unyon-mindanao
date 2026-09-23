import "server-only";
import type { TransactionRunner } from "./contracts";

/** Opt in only for operations whose effects are entirely rolled back with PostgreSQL. */
export function retryDatabaseTransactions<Capabilities extends object>(runner: TransactionRunner<Capabilities>): TransactionRunner<Capabilities> {
  return { async run(input, work) {
    for (let attempt = 0; ; attempt++) {
      try { return await runner.run(input, work); }
      catch (error) {
        const conflict = typeof error === "object" && error !== null && (("code" in error && error.code === "P2034") || ("cause" in error && typeof error.cause === "object" && error.cause !== null && "originalCode" in error.cause && error.cause.originalCode === "40001"));
        if (!conflict || attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt + Math.floor(Math.random() * 20)));
      }
    }
  } };
}
