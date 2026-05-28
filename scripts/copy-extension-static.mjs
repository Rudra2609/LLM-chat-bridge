import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "extension");
const outRoot = join(root, "dist");
const excluded = new Set([
  "popup.html",
  "popup.js",
  "popup.css",
  "options.html",
  "options.js",
  "options.css"
]);

copyDirectory(sourceRoot);
promoteBuiltHtml("popup.html");
promoteBuiltHtml("options.html");
rmSync(join(outRoot, "extension"), { recursive: true, force: true });
rmSync(join(outRoot, "shared"), { recursive: true, force: true });
console.log("Copied static extension runtime files.");

function copyDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const sourcePath = join(directory, entry);
    const relativePath = relative(sourceRoot, sourcePath).replaceAll("\\", "/");
    if (excluded.has(relativePath)) continue;

    const targetPath = join(outRoot, relativePath);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDirectory(sourcePath);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function promoteBuiltHtml(fileName) {
  const builtPath = join(outRoot, "extension", fileName);
  const targetPath = join(outRoot, fileName);
  const html = readFileSync(builtPath, "utf8").replaceAll("../assets/", "assets/");
  writeFileSync(targetPath, html);
}
