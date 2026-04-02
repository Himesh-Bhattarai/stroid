import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cacheDir = process.env.STROID_NPM_CACHE
  ?? path.join(os.tmpdir(), `stroid-npm-cache-${process.pid}`);

fs.mkdirSync(cacheDir, { recursive: true });

const cmd = process.platform === "win32" ? "attw.cmd" : "attw";
const args = process.argv.length > 2
  ? process.argv.slice(2)
  : ["--pack", ".", "--profile", "esm-only"];

const result = spawnSync(cmd, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_cache: cacheDir,
    NPM_CONFIG_CACHE: cacheDir,
  },
});

process.exit(result.status ?? 1);

