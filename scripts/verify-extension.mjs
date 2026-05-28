import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const extensionRoot = process.argv[2] ? join(root, process.argv[2]) : join(root, "extension");
const requiredFiles = [
  "manifest.json",
  "background.js",
  "contentScript.js",
  "popup.html",
  "options.html",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
];

for (const file of requiredFiles) {
  const fullPath = join(extensionRoot, file);
  statSync(fullPath);
}

const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
}

if (!Array.isArray(manifest.host_permissions) || manifest.host_permissions.length === 0) {
  throw new Error("manifest.json must declare narrow host_permissions.");
}

console.log("Extension verification passed.");
