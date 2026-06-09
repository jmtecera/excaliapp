import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(ROOT_DIR, "dist");
const WEB_BUILD_DIR = join(ROOT_DIR, "apps", "web", "dist");
const PACKAGE_BUILD_DIR = join(DIST_DIR, "build", "web");
const ZIP_PATH = join(DIST_DIR, "excalidraw-room-manager-web.zip");

mkdirSync(DIST_DIR, { recursive: true });
rmSync(WEB_BUILD_DIR, { recursive: true, force: true });
rmSync(PACKAGE_BUILD_DIR, { recursive: true, force: true });
rmSync(ZIP_PATH, { force: true });

run("pnpm", ["web:build"], ROOT_DIR);

if (!existsSync(join(WEB_BUILD_DIR, "index.html"))) {
  throw new Error("Web build did not create apps/web/dist/index.html");
}

cpSync(WEB_BUILD_DIR, PACKAGE_BUILD_DIR, { recursive: true });
run("zip", ["-qr", ZIP_PATH, "."], PACKAGE_BUILD_DIR);

console.log(`Packaged ${ZIP_PATH}`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
