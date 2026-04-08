import { isMainModule, runCliWrapper } from "./cli-wrapper.mjs";

export const runAttw = ({
  argv = process.argv.slice(2),
  platform = process.platform,
  env = process.env,
  pid = process.pid,
  spawnSyncImpl,
  stderr = process.stderr,
} = {}) => runCliWrapper({
  tool: "attw",
  argv,
  defaultArgs: ["--pack", ".", "--profile", "esm-only"],
  platform,
  env,
  pid,
  spawnSyncImpl,
  stderr,
});

if (isMainModule(import.meta.url)) {
  process.exit(runAttw());
}

