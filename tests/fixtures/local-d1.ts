import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type SQLiteValue = null | number | bigint | string | NodeJS.ArrayBufferView;

class LocalD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new LocalD1Statement(this.database, this.query, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.query).get(...(this.values as SQLiteValue[])) as T | undefined) ?? null;
  }

  async all<T>() {
    return {
      results: this.database.prepare(this.query).all(...(this.values as SQLiteValue[])) as T[],
      success: true,
    };
  }

  async run<T>() {
    const result = this.database.prepare(this.query).run(...(this.values as SQLiteValue[]));
    return {
      meta: { changes: Number(result.changes) },
      results: [] as T[],
      success: true,
    };
  }
}

export class LocalD1Database {
  private readonly database = new DatabaseSync(":memory:");

  constructor(migrations = ["0001_access_foundation.sql"]) {
    for (const migration of migrations) {
      this.database.exec(
        readFileSync(
          join(process.cwd(), "database/d1/migrations", migration),
          "utf8",
        ),
      );
    }
  }

  prepare(query: string) {
    return new LocalD1Statement(this.database, query);
  }

  exec(sql: string) {
    this.database.exec(sql);
  }

  withSession() {
    return this as unknown as D1DatabaseSession;
  }

  async batch<T>(statements: LocalD1Statement[]) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}
