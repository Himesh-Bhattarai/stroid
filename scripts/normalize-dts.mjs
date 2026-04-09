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
  return files.sort();
};

const renameHashedDts = async (files) => {
  const map = new Map();
  const usedTargets = new Set(
    files
      .filter(isDtsFile)
      .map((file) => path.relative(distDir, file))
  );
  for (const file of files) {
    const base = path.basename(file);
    const match = base.match(hashPattern);
    if (!match) continue;
    const prefix = match[1];
    const hash = match[2];
    const ext = match[3];
    if (!/[A-Z0-9]/.test(hash)) continue;
    const stablePrefix = prefix === "index" ? "index-internal" : prefix;
    let nextBase = stablePrefix;
    let candidate = path.join(path.dirname(file), `${nextBase}.d.${ext}`);
    let candidateRelative = path.relative(distDir, candidate);
    let suffix = 1;

    usedTargets.delete(path.relative(distDir, file));
    while (usedTargets.has(candidateRelative)) {
      nextBase = `${stablePrefix}-internal${suffix === 1 ? "" : `-${suffix}`}`;
      candidate = path.join(path.dirname(file), `${nextBase}.d.${ext}`);
      candidateRelative = path.relative(distDir, candidate);
      suffix += 1;
    }

    map.set(path.basename(file, `.d.${ext}`), nextBase);
    await fs.rename(file, candidate);
    usedTargets.add(candidateRelative);
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
