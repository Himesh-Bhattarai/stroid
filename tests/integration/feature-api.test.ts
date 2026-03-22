/**
 * @module tests/feature-api.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/feature-api.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

test("pure feature entrypoints require explicit install", () => {
  const configPath = path.join(repoRoot, "src", "config.ts");
  const persistPath = path.join(repoRoot, "src", "persist.ts");
  const syncPath = path.join(repoRoot, "src", "sync.ts");
  const devtoolsPath = path.join(repoRoot, "src", "devtools", "index.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");

  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const config = await import(pathToFileURL(${JSON.stringify(configPath)}).href);
    const persist = await import(pathToFileURL(${JSON.stringify(persistPath)}).href);
    const sync = await import(pathToFileURL(${JSON.stringify(syncPath)}).href);
    const devtools = await import(pathToFileURL(${JSON.stringify(devtoolsPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    config.configureStroid({ strictMissingFeatures: true });

    assert.throws(() => {
      store.createStore("persistPure", { value: 1 }, { persist: true });
    }, /not registered/);

    assert.throws(() => {
      store.createStore("syncPure", { value: 1 }, { sync: { channel: "pure-sync", policy: "insecure" } });
    }, /not registered/);

    assert.throws(() => {
      store.createStore("devtoolsPure", { value: 1 }, { devtools: true });
    }, /not registered/);

    persist.installPersist();
    sync.installSync();
    devtools.installDevtools();

    assert.doesNotThrow(() => {
      store.createStore("persistPureOk", { value: 1 }, { persist: true });
    });

    assert.doesNotThrow(() => {
      store.createStore("syncPureOk", { value: 1 }, { sync: { channel: "pure-sync", policy: "insecure" } });
    });

    assert.doesNotThrow(() => {
      store.createStore("devtoolsPureOk", { value: 1 }, { devtools: true });
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

test("feature lifecycle hooks fire in order and resetAll runs", () => {
  const featurePath = path.join(repoRoot, "src", "feature.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const testingPath = path.join(repoRoot, "src", "helpers", "testing.ts");

  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const feature = await import(pathToFileURL(${JSON.stringify(featurePath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);
    const testing = await import(pathToFileURL(${JSON.stringify(testingPath)}).href);

    const events = [];
    feature.registerStoreFeature("lifecycleFeature", () => ({
      onStoreCreate(ctx) {
        events.push(["create", ctx.name, ctx.options.features?.lifecycleFeature?.tag ?? null]);
      },
      onStoreWrite(ctx) {
        events.push(["write", ctx.action, ctx.prev, ctx.next]);
      },
      beforeStoreDelete(ctx) {
        events.push(["beforeDelete", ctx.prev]);
      },
      afterStoreDelete() {
        events.push(["afterDelete"]);
      },
      resetAll() {
        events.push(["resetAll"]);
      },
    }));

    store.createStore("alpha", { count: 1 }, {
      features: { lifecycleFeature: { tag: "ok" } },
    });
    store.setStore("alpha", "count", 2);
    store.deleteStore("alpha");
    testing.resetAllStoresForTest();

    const createEvent = events.find((e) => e[0] === "create");
    const writeEvent = events.find((e) => e[0] === "write");
    const beforeEvent = events.find((e) => e[0] === "beforeDelete");
    const afterEvent = events.find((e) => e[0] === "afterDelete");
    const resetEvent = events.find((e) => e[0] === "resetAll");

    assert.deepStrictEqual(createEvent, ["create", "alpha", "ok"]);
    assert.ok(writeEvent && writeEvent[1] === "set");
    assert.deepStrictEqual(writeEvent[2], { count: 1 });
    assert.deepStrictEqual(writeEvent[3], { count: 2 });
    assert.ok(beforeEvent);
    assert.ok(afterEvent);
    assert.ok(resetEvent);
  `;

  const result = runScript(script);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("feature can apply state during create", () => {
  const featurePath = path.join(repoRoot, "src", "feature.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");

  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const feature = await import(pathToFileURL(${JSON.stringify(featurePath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    feature.registerStoreFeature("appliedState", () => ({
      onStoreCreate(ctx) {
        ctx.applyFeatureState({ value: 42 });
      },
    }));

    store.createStore("beta", { value: 1 }, {
      features: { appliedState: { enabled: true } },
    });

    assert.deepStrictEqual(store.getStore("beta"), { value: 42 });
  `;

  const result = runScript(script);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});



