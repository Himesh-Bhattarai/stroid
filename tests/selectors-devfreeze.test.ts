/**
 * @module tests/selectors-devfreeze.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/selectors-devfreeze.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";

test("subscribeWithSelector passes a mutable value to selector in dev mode", () => {
  const script = `
    import { createStore, setStore } from "./src/store.js";
    import { subscribeWithSelector } from "./src/selectors.js";

    createStore("x", { list: [] });
    subscribeWithSelector(
      "x",
      (state) => {
        state.list.push(1);
        return state.list.length;
      },
      Object.is,
      () => {}
    );
    setStore("x", "list", []);
    console.log("ok");
  `;

  const res = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development" },
    encoding: "utf-8",
  });

  assert.strictEqual(res.status, 0, `child process failed:\n${res.stderr || res.stdout}`);
  assert.match(res.stdout ?? "", /ok/);
});



