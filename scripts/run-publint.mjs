import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cacheDir = process.env.STROID_NPM_CACHE
  ?? path.join(os.tmpdir(), `stroid-npm-cache-${process.pid}`);

fs.mkdirSync(cacheDir, { recursive: true });

const cmd = process.platform === "win32" ? "publint.cmd" : "publint";
const args = process.argv.slice(2);

const result = spawnSync(cmd, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    // Ensure sub-process `npm pack` calls don't touch a broken global ~/.npm cache.
    npm_config_cache: cacheDir,
    NPM_CONFIG_CACHE: cacheDir,
  },
});

process.exit(result.status ?? 1);

