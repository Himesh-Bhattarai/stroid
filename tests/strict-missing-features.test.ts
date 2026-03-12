import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("strictMissingFeatures throws when a feature is requested but not registered", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = path.join(repoRoot, "src", "config.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const config = await import(pathToFileURL(${JSON.stringify(configPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    config.configureStroid({ strictMissingFeatures: true });

    assert.throws(() => {
      store.createStore("user", { name: "Alex" }, { persist: true });
    }, /not registered/);
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});
