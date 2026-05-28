import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "extension/manifest.json",
  "extension/background.js",
  "extension/contentScript.js",
  "extension/popup.html",
  "extension/popup.js",
  "extension/options.html",
  "extension/options.js",
  "extension/shared/formatter.js",
  "extension/icons/icon-16.png",
  "extension/icons/icon-32.png",
  "extension/icons/icon-48.png",
  "extension/icons/icon-128.png"
];

for (const file of requiredFiles) {
  const fullPath = join(root, file);
  statSync(fullPath);
}

const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
}

if (!Array.isArray(manifest.host_permissions) || manifest.host_permissions.length === 0) {
  throw new Error("manifest.json must declare narrow host_permissions.");
}

console.log("Extension verification passed.");
