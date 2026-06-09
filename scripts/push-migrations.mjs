import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

loadLocalEnvironment();

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error(
    "Missing POSTGRES_URL_NON_POOLING, SUPABASE_DB_URL, or POSTGRES_URL. " +
      "Use the non-pooling connection URL for migrations when available.",
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "dlx",
    "supabase@2.105.0",
    "db",
    "push",
    "--db-url",
    databaseUrl,
    "--include-all",
  ],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);

function loadLocalEnvironment() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}
