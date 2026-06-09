import { spawnSync } from "node:child_process";

const projectRef =
  process.argv[2] ||
  process.env.SUPABASE_PROJECT_REF ||
  process.env.SUPABASE_PROJECT_ID ||
  "";

if (!projectRef) {
  console.error("Missing Supabase project ref. Set SUPABASE_PROJECT_REF or pass it as the first argument.");
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "dlx",
    "supabase@latest",
    "functions",
    "deploy",
    "excalidraw-sync",
    "--project-ref",
    projectRef,
    "--no-verify-jwt",
  ],
  {
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}
