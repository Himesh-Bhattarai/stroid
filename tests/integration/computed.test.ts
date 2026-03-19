/**
 * @module tests/computed.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/computed.test.
 *
 * Consumers: Test runner.
 */
import test, { type TestContext } from "node:test";
import assert from "node:assert";
import { createStore, setStore, replaceStore, getStore, deleteStore, hasStore } from "../../src/store.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import {
  createComputed,
  invalidateComputed,
  deleteComputed,
  _resetComputedForTests,
} from "../../src/computed/index.js";
import { detectCycle, getTopoOrderedComputeds } from "../../src/computed/computed-graph.js";
import { configureStroid, resetConfig } from "../../src/config.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const runCase = async (t: TestContext, name: string, fn: () => Promise<void> | void) => {
  await t.test(name, async () => {
    clearAllStores();
    _resetComputedForTests();
    await fn();
  });
};

test("computed", async (t) => {
  await runCase(t, "derives value from single source", async () => {
    createStore("count", 0);
    createComputed("doubled", ["count"], (n) => (n as number) * 2);

    assert.strictEqual(getStore("doubled"), 0);

    replaceStore("count", 5);
    await wait();

    assert.strictEqual(getStore("doubled"), 10);
  });

  await runCase(t, "derives from multiple sources", async () => {
    createStore("firstName", "John");
    createStore("lastName", "Doe");
    createComputed("fullName", ["firstName", "lastName"], (f, l) => `${f} ${l}`);

    assert.strictEqual(getStore("fullName"), "John Doe");

    replaceStore("firstName", "Jane");
    await wait();

    assert.strictEqual(getStore("fullName"), "Jane Doe");
  });

  await runCase(t, "does not notify if computed value unchanged", async () => {
    createStore("x", 1);
    createComputed("sign", ["x"], (n) => (n as number) > 0 ? "positive" : "non-positive");

    let notifyCount = 0;
    const { subscribeStore } = await import("../../src/core/store-notify.js");
    subscribeStore("sign", () => { notifyCount += 1; });

    replaceStore("x", 2);
    await wait();
    assert.strictEqual(notifyCount, 0);

    replaceStore("x", -1);
    await wait();
    assert.strictEqual(notifyCount, 1);
  });

  await runCase(t, "rejects direct cycle", async () => {
    createStore("a", 1);
    createComputed("b", ["a"], (x) => x);
    const result = createComputed("a", ["b"], (x) => x);
    assert.strictEqual(result, undefined);
    assert.strictEqual(getStore("a"), 1);
  });

  await runCase(t, "rejects indirect cycle", async () => {
    createStore("x", 0);
    createComputed("y", ["x"], (v) => v);
    createComputed("z", ["y"], (v) => v);
    const result = createComputed("x", ["z"], (v) => v);
    assert.strictEqual(result, undefined);
  });

  await runCase(t, "detectCycle returns path string on cycle", async () => {
    const { registerComputed } = await import("../../src/computed/computed-graph.js");
    registerComputed("m", ["n"], (v) => v);
    const trace = detectCycle("n", ["m"]);
    assert.ok(typeof trace === "string");
    assert.ok(trace.includes("->"));
  });

  await runCase(t, "createComputed warns when dependencies are missing", async () => {
    const warnings: string[] = [];
    configureStroid({
      logSink: {
        warn: (msg: string) => warnings.push(msg),
      },
    });

    try {
      createComputed("missingDeps", ["ghostStore"], (value) => value);
    } finally {
      resetConfig();
    }

    assert.ok(warnings.some((msg) => msg.includes("dependencies not found")));
  });

  await runCase(t, "topo order: shallow dependency resolved first", async () => {
    createStore("src", 0);
    createComputed("level1", ["src"], (v) => v);
    createComputed("level2", ["level1"], (v) => v);

    const order = getTopoOrderedComputeds(["src"]);
    assert.deepStrictEqual(order, ["level1", "level2"]);
  });

  await runCase(t, "topo order: diamond dependency resolved correctly", async () => {
    createStore("src", 0);
    createComputed("left", ["src"], (v) => v);
    createComputed("right", ["src"], (v) => v);
    createComputed("combined", ["left", "right"], (l, r) => [l, r]);

    const order = getTopoOrderedComputeds(["src"]);
    const combinedIdx = order.indexOf("combined");
    const leftIdx = order.indexOf("left");
    const rightIdx = order.indexOf("right");

    assert.ok(leftIdx < combinedIdx);
    assert.ok(rightIdx < combinedIdx);
  });

  await runCase(t, "invalidateComputed forces recomputation", async () => {
    createStore("base", 1);
    let externalValue = 10;
    createComputed("withExternal", ["base"], (b) => (b as number) + externalValue);

    assert.strictEqual(getStore("withExternal"), 11);

    externalValue = 20;
    invalidateComputed("withExternal");
    await wait();

    assert.strictEqual(getStore("withExternal"), 21);
  });

  await runCase(t, "deleteComputed stops reactivity", async () => {
    createStore("src", 0);
    createComputed("derived", ["src"], (v) => (v as number) * 2);

    replaceStore("src", 5);
    await wait();
    assert.strictEqual(getStore("derived"), 10);

    deleteComputed("derived");

    replaceStore("src", 99);
    await wait();
    assert.strictEqual(getStore("derived"), 10);
  });

  await runCase(t, "re-registering computed cleans up prior subscriptions", async () => {
    createStore("base", 1);

    let firstRuns = 0;
    let secondRuns = 0;

    createComputed("twice", ["base"], (n) => {
      firstRuns += 1;
      return (n as number) * 2;
    });

    replaceStore("base", 2);
    await wait();

    assert.strictEqual(firstRuns, 2);
    assert.strictEqual(getStore("twice"), 4);

    createComputed("twice", ["base"], (n) => {
      secondRuns += 1;
      return (n as number) * 3;
    });

    replaceStore("base", 3);
    await wait();

    assert.strictEqual(firstRuns, 2);
    assert.strictEqual(secondRuns, 2);
    assert.strictEqual(getStore("twice"), 9);
  });

  await runCase(t, "compute function throwing does not crash -- returns previous value", async () => {
    createStore("n", 2);
    createComputed("safe", ["n"], (v) => {
      if ((v as number) > 5) throw new Error("too big");
      return (v as number) * 2;
    });

    assert.strictEqual(getStore("safe"), 4);

    replaceStore("n", 10);
    await wait();

    assert.strictEqual(getStore("safe"), 4);
  });

  await runCase(t, "computed handles 50+ dependencies", async () => {
    const total = 60;
    let expected = 0;
    const deps: string[] = [];

    for (let i = 0; i < total; i += 1) {
      const name = `src${i}`;
      deps.push(name);
      expected += i;
      createStore(name, i);
    }

    createComputed("sumAll", deps, (...values) =>
      values.reduce((acc, value) => acc + (value as number), 0)
    );

    assert.strictEqual(getStore("sumAll"), expected);

    replaceStore("src10", 1000);
    expected = expected - 10 + 1000;
    await wait();

    assert.strictEqual(getStore("sumAll"), expected);
  });

  await runCase(t, "computed updates even when base store uses persist", async () => {
    await import("../../src/persist.js");
    const writes: string[] = [];
    const driver = {
      getItem: () => null,
      setItem: (_key: string, value: string) => {
        writes.push(value);
      },
      removeItem: () => {},
    };

    createStore("basePersist", { value: 1 }, {
      persist: {
        driver,
        key: "basePersist",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
      },
    });
    createComputed("derivedPersist", ["basePersist"], (v) => (v as any).value * 2);

    replaceStore("basePersist", { value: 3 });
    await wait(20);

    assert.strictEqual(getStore("derivedPersist"), 6);
    assert.ok(writes.length > 0);
  });

  await runCase(t, "computed handles dependency deleted during recomputation", async () => {
    createStore("dep", { value: 1 });
    let calls = 0;

    createComputed("depComputed", ["dep"], (value) => {
      calls += 1;
      if (calls === 2) {
        deleteStore("dep");
      }
      return value ? (value as any).value * 2 : null;
    });

    replaceStore("dep", { value: 2 });
    await wait();

    assert.strictEqual(getStore("depComputed"), 4);
    assert.strictEqual(hasStore("dep"), false);
  });
});
