import { isMainModule, runCliWrapper } from "./cli-wrapper.mjs";

export const runPublint = ({
  argv = process.argv.slice(2),
  platform = process.platform,
  env = process.env,
  pid = process.pid,
  spawnSyncImpl,
  stderr = process.stderr,
} = {}) => runCliWrapper({
  tool: "publint",
  argv,
  defaultArgs: [],
  platform,
  env,
  pid,
  spawnSyncImpl,
  stderr,
});

if (isMainModule(import.meta.url)) {
  process.exit(runPublint());
}

