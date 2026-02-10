import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle");

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function latestFile(dir, extensions) {
  if (!(await pathExists(dir))) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
    const fullPath = path.join(dir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.fullPath ?? null;
}

async function copyLatest(dir, extensions, label) {
  const latest = await latestFile(dir, extensions);
  if (!latest) return;
  const dest = path.join(rootDir, path.basename(latest));
  await fs.copyFile(latest, dest);
  console.log(`Copied ${label}: ${path.basename(latest)}`);
}

async function copyDirIfExists(sourceDir, label) {
  if (!(await pathExists(sourceDir))) return;
  const dest = path.join(rootDir, path.basename(sourceDir));
  await fs.cp(sourceDir, dest, { recursive: true, force: true });
  console.log(`Copied ${label}: ${path.basename(sourceDir)}`);
}

async function main() {
  if (!(await pathExists(bundleDir))) {
    console.error(`Bundle directory not found: ${bundleDir}`);
    process.exit(1);
  }

  // macOS artifacts
  await copyLatest(path.join(bundleDir, "macos"), [".dmg"], "macOS dmg");
  await copyDirIfExists(path.join(bundleDir, "macos", "Studioklocka.app"), "macOS app");

  // Windows artifacts
  await copyLatest(path.join(bundleDir, "msi"), [".msi"], "Windows msi");
  await copyLatest(path.join(bundleDir, "nsis"), [".exe"], "Windows exe");

  // Linux artifacts
  await copyLatest(path.join(bundleDir, "deb"), [".deb"], "Linux deb");
  await copyLatest(path.join(bundleDir, "appimage"), [".AppImage"], "Linux AppImage");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
