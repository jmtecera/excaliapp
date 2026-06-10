import { spawnSync } from "node:child_process";

const hasDatabaseUrl = Boolean(
  process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL,
);

if (hasDatabaseUrl) {
  run("pnpm", ["db:push"]);
} else {
  console.warn("No database migration URL is configured; skipping Supabase migrations.");
}

run("pnpm", ["build"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
