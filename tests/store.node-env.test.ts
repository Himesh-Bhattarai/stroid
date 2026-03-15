/**
 * @module tests/store.node-env.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/store.node-env.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("hydrateStores surfaces blocked production SSR store creation", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const configPath = path.join(repoRoot, "src", "config.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const config = await import(pathToFileURL(${JSON.stringify(configPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    const errors = [];
    const warnings = [];
    config.configureStroid({ logSink: { warn: (msg) => warnings.push(msg) } });
    store.hydrateStores(
      { ssrHydrate: { value: 1 } },
      {
        default: {
          onError: (msg) => { errors.push(msg); },
        },
      },
      { allowUntrusted: true }
    );

    assert.strictEqual(store.hasStore("ssrHydrate"), false);
    assert.ok(errors.some((msg) => msg.includes('createStore("ssrHydrate") is blocked on the server in production')));
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("allowSSRGlobalStore warns in production server", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const configPath = path.join(repoRoot, "src", "config.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const config = await import(pathToFileURL(${JSON.stringify(configPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    const warnings = [];
    config.configureStroid({ logSink: { warn: (msg) => warnings.push(msg) } });

    store.createStore("ssrAllowed", { value: 1 }, { allowSSRGlobalStore: true });

    assert.ok(warnings.some((msg) => msg.includes("allowSSRGlobalStore") && msg.includes("server in production")));
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("unknown Node env falls back to production mode", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const utilsPath = path.join(repoRoot, "src", "utils.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const utils = await import(pathToFileURL(${JSON.stringify(utilsPath)}).href);
    assert.strictEqual(utils.__DEV__, false);
    assert.strictEqual(utils.isDev(), false);
  `;

  const env = { ...process.env } as Record<string, string>;
  delete env.NODE_ENV;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("history snapshots stay immutable in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const devtoolsPath = path.join(repoRoot, "src", "devtools.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    await import(pathToFileURL(${JSON.stringify(devtoolsPath)}).href);
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);
    const devtools = await import(pathToFileURL(${JSON.stringify(devtoolsPath)}).href);

    store.createStore("user", { profile: { color: "blue" } }, { allowSSRGlobalStore: true });
    store.setStore("user", { profile: { color: "green" } });

    const history = devtools.getHistory("user");
    history[1].next.profile.color = "red";

    assert.deepStrictEqual(devtools.getHistory("user")[1].next, { profile: { color: "green" } });

    const live = store.getStore("user");
    live.profile.color = "purple";

    assert.deepStrictEqual(devtools.getHistory("user")[1].next, { profile: { color: "green" } });
    assert.deepStrictEqual(store.getStore("user"), { profile: { color: "green" } });
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("full package stays lean and requires explicit devtools registration in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const indexPath = path.join(repoRoot, "src", "index.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const stroid = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
    const errors = [];

    assert.throws(() => {
      stroid.createStore("user", { profile: { color: "blue" } }, {
        allowSSRGlobalStore: true,
        devtools: {
          enabled: true,
          historyLimit: 10,
        },
        onError: (msg) => errors.push(msg),
      });
    }, /not registered/);

    assert.strictEqual(typeof stroid.getHistory, "undefined");
    assert.strictEqual(typeof stroid.clearAllStores, "undefined");
    assert.ok(errors.some((msg) => msg.includes('Store "user" requested devtools support, but "devtools" is not registered.')));
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});


