import { promises as fs } from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");

const isDtsFile = (name) => name.endsWith(".d.ts") || name.endsWith(".d.cts");
const hashPattern = /^([A-Za-z0-9_-]+)-([A-Za-z0-9_-]{4,})\.d\.(ts|cts)$/;

const collectFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const renameHashedDts = async (files) => {
  const map = new Map();
  for (const file of files) {
    const base = path.basename(file);
    const match = base.match(hashPattern);
    if (!match) continue;
    const prefix = match[1];
    const hash = match[2];
    const ext = match[3];
    if (!/[A-Z0-9]/.test(hash)) continue;
    const stablePrefix = prefix === "index" ? "index-internal" : prefix;
    const target = path.join(path.dirname(file), `${stablePrefix}.d.${ext}`);
    map.set(path.basename(file, `.d.${ext}`), stablePrefix);
    try {
      await fs.rename(file, target);
    } catch (err) {
      if ((err && err.code) === "EEXIST") {
        await fs.unlink(file);
      } else {
        throw err;
      }
    }
  }
  return map;
};

const rewriteImports = async (files, map) => {
  if (map.size === 0) return;
  const entries = Array.from(map.entries());
  for (const file of files) {
    if (!isDtsFile(file)) continue;
    let text = await fs.readFile(file, "utf8");
    let next = text;
    for (const [oldBase, newBase] of entries) {
      next = next.replaceAll(`./${oldBase}.js`, `./${newBase}.js`);
      next = next.replaceAll(`./${oldBase}.cjs`, `./${newBase}.cjs`);
    }
    if (next !== text) {
      await fs.writeFile(file, next, "utf8");
    }
  }
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const ensureCtsEntry = async (baseName) => {
  const dtsPath = path.join(distDir, `${baseName}.d.ts`);
  const ctsPath = path.join(distDir, `${baseName}.d.cts`);
  if (!await fileExists(dtsPath)) return;
  if (await fileExists(ctsPath)) return;
  await fs.copyFile(dtsPath, ctsPath);
};

const run = async () => {
  const files = await collectFiles(distDir);
  const map = await renameHashedDts(files);
  const updatedFiles = await collectFiles(distDir);
  await rewriteImports(updatedFiles, map);
  await ensureCtsEntry("index");
};

run().catch((err) => {
  console.error("[normalize-dts] failed:", err);
  process.exit(1);
});
