import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const EXTENSION_DIR = join(ROOT_DIR, "extension");
const DIST_DIR = join(ROOT_DIR, "dist");
const BUILD_DIR = join(DIST_DIR, "build");
const TARGETS = ["chrome", "firefox"];

const requestedTarget = process.argv[2] || "all";
const targets = requestedTarget === "all" ? TARGETS : [requestedTarget];

for (const target of targets) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown package target: ${target}`);
  }
}

mkdirSync(DIST_DIR, { recursive: true });
mkdirSync(BUILD_DIR, { recursive: true });

for (const target of targets) {
  packageTarget(target);
}

function packageTarget(target) {
  const outputDir = join(BUILD_DIR, target);
  const zipPath = join(DIST_DIR, `excalidraw-room-manager-${target}.zip`);

  rmSync(outputDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  cpSync(EXTENSION_DIR, outputDir, { recursive: true });
  writeManifest(outputDir, target);
  zipDirectory(outputDir, zipPath);
  console.log(`Packaged ${zipPath}`);
}

function writeManifest(outputDir, target) {
  const manifestPath = join(outputDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (target === "firefox") {
    manifest.background = {
      scripts: [manifest.background.service_worker],
      type: manifest.background.type || "module",
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: "excalidraw-room-manager@example.com",
        strict_min_version: "109.0",
      },
    };
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function zipDirectory(sourceDir, zipPath) {
  const result = spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: sourceDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
