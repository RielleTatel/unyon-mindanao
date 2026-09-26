import { execFileSync } from "node:child_process";

interface D1ExecutionResult<Row = Record<string, unknown>> {
  results: Row[];
  success: boolean;
}

export function executeLocalD1(sql: string) {
  if (process.env.APP_ENV !== "local") {
    throw new Error("Browser-test D1 fixtures are restricted to local development");
  }
  const output = execFileSync(
    "./node_modules/.bin/wrangler",
    [
      "d1", "execute", "unyon-mindanao-local-d1", "--local", "--yes",
      "--config", "wrangler.d1.local.jsonc", "--json", "--command", sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output) as D1ExecutionResult[];
}

export function queryLocalD1<Row>(sql: string) {
  return executeLocalD1(sql).at(-1)?.results as Row[] | undefined ?? [];
}

export function d1SqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
