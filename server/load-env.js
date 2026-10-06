import { existsSync } from "node:fs";

// Import this module before anything that reads process.env at load time.
// Variables already set in the environment take precedence over both files,
// and .env.local takes precedence over .env.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
