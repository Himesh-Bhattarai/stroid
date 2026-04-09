import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resolveCacheDir = (env, pid) => env.STROID_NPM_CACHE
  ?? path.join(os.tmpdir(), `stroid-npm-cache-${pid}`);

export const isMainModule = (moduleUrl, argvPath = process.argv[1]) => {
  if (!argvPath) return false;
  return path.resolve(argvPath) === fileURLToPath(moduleUrl);
};

export const runCliWrapper = ({
  tool,
  argv = [],
  defaultArgs = [],
  platform = process.platform,
  env = process.env,
  pid = process.pid,
  spawnSyncImpl = spawnSync,
  stderr = process.stderr,
}) => {
  const cacheDir = resolveCacheDir(env, pid);
  fs.mkdirSync(cacheDir, { recursive: true });

  const command = platform === "win32" ? `${tool}.cmd` : tool;
  const args = argv.length > 0 ? argv : defaultArgs;
  const result = spawnSyncImpl(command, args, {
    stdio: "inherit",
    shell: platform === "win32",
    env: {
      ...env,
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir,
    },
  });

  if (result.error) {
    stderr.write(`[stroid] ${tool} wrapper failed to start: ${result.error.message}\n`);
    return 1;
  }

  return result.status ?? 1;
};
