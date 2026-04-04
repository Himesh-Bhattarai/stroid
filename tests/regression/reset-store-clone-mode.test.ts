/**
 * Regression: resetStore clone strategy.
 *
 * WHAT: Verifies resetStore supports deep/shallow/none clone modes.
 * WHY: Frequent resets on large stores need predictable performance trade-offs without silent correctness regressions.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore, getStore, resetStore, setStore } from "../../src/store.js";
import { configureStroid, resetConfig } from "../../src/config.js";

type ResetState = { nested: { count: number } };

const readRef = (name: string): ResetState => getStore(name) as ResetState;

test("resetStore defaults to deep clone isolation", () => {
  clearAllStores();
  createStore("resetDeep", { nested: { count: 1 } }, { snapshot: "ref" });

  setStore("resetDeep", { nested: { count: 9 } });
  resetStore("resetDeep");

  const first = readRef("resetDeep");
  first.nested.count = 42;
  resetStore("resetDeep");
  const second = readRef("resetDeep");

  assert.notStrictEqual(second, first);
  assert.notStrictEqual(second.nested, first.nested);
  assert.strictEqual(second.nested.count, 1);
});

test("resetStore resetClone='none' reuses the initial snapshot reference", () => {
  clearAllStores();
  createStore("resetNone", { nested: { count: 1 } }, { snapshot: "ref", resetClone: "none" });

  setStore("resetNone", { nested: { count: 9 } });
  resetStore("resetNone");

  const first = readRef("resetNone");
  first.nested.count = 77;
  resetStore("resetNone");
  const second = readRef("resetNone");

  assert.strictEqual(second, first);
  assert.strictEqual(second.nested.count, 77);
});

test("resetStore resetClone='shallow' clones container but keeps nested references", () => {
  clearAllStores();
  createStore("resetShallow", { nested: { count: 1 } }, { snapshot: "ref", resetClone: "shallow" });

  setStore("resetShallow", { nested: { count: 9 } });
  resetStore("resetShallow");

  const first = readRef("resetShallow");
  first.nested.count = 55;
  resetStore("resetShallow");
  const second = readRef("resetShallow");

  assert.notStrictEqual(second, first);
  assert.strictEqual(second.nested, first.nested);
  assert.strictEqual(second.nested.count, 55);
});

test("configureStroid resetCloneMode applies when store option is omitted", () => {
  clearAllStores();
  configureStroid({ resetCloneMode: "none" });

  try {
    createStore("resetConfigNone", { nested: { count: 1 } }, { snapshot: "ref" });
    setStore("resetConfigNone", { nested: { count: 9 } });
    resetStore("resetConfigNone");

    const first = readRef("resetConfigNone");
    first.nested.count = 66;
    resetStore("resetConfigNone");
    const second = readRef("resetConfigNone");

    assert.strictEqual(second, first);
    assert.strictEqual(second.nested.count, 66);
  } finally {
    resetConfig();
  }
});

