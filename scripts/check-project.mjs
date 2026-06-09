import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const jsFiles = [
  "extension/src/encoding.js",
  "extension/src/browser-api.js",
  "extension/src/theme.js",
  "extension/src/room-utils.js",
  "extension/src/storage.js",
  "extension/src/workspace-utils.js",
  "extension/src/workspace-storage.js",
  "extension/src/sync.js",
  "extension/src/background.js",
  "extension/popup/popup.js",
  "extension/options/options.js",
  "server/sync-server.js",
];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const iconPaths = {
  ...manifest.icons,
  ...manifest.action.default_icon,
};

for (const [size, iconPath] of Object.entries(iconPaths)) {
  const fullPath = `extension/${iconPath}`;

  if (!existsSync(fullPath)) {
    throw new Error(`Missing ${size}px icon: ${fullPath}`);
  }
}

console.log("Project checks passed.");
