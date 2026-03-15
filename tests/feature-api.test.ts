/**
 * @fileoverview tests\feature-api.test.ts
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runScript = (script: string) =>
  spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
  });

test("installPersist enables persist when strictMissingFeatures is on", () => {
  const configPath = path.join(repoRoot, "src", "config.ts");
  const installPath = path.join(repoRoot, "src", "install.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");

  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const config = await import(pathToFileURL(${JSON.stringify(configPath)}).href);
    const install = await import(pathToFileURL(${JSON.stringify(installPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    config.configureStroid({ strictMissingFeatures: true });

    assert.throws(() => {
      store.createStore("user", { name: "A" }, { persist: true });
    }, /not registered/);

    install.installPersist();

    assert.doesNotThrow(() => {
      store.createStore("user2", { name: "B" }, { persist: true });
    });
  `;

  const result = runScript(script);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("public feature API registers custom features and forwards feature options", () => {
  const featurePath = path.join(repoRoot, "src", "feature.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");

  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const feature = await import(pathToFileURL(${JSON.stringify(featurePath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    let captured = null;
    feature.registerStoreFeature("customFeature", () => ({
      onStoreCreate(ctx) {
        captured = ctx.options.features?.customFeature ?? null;
      },
    }));

    store.createStore("custom", { value: 1 }, {
      features: {
        customFeature: { enabled: true },
      },
    });

    assert.deepStrictEqual(captured, { enabled: true });
  `;

  const result = runScript(script);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

