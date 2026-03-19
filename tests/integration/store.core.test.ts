/**
 * @module tests/store.core.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/store.core.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  setStore,
  replaceStore,
  getStore,
  resetStore,
  deleteStore,
  hasStore,
  hydrateStores,
  _subscribe,
  _getSnapshot,
  _getStoreValueRef,
} from "../../src/store.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import { subscribeWithSelector } from "../../src/selectors/index.js";
import { createComputed } from "../../src/computed/index.js";

test("core create, set, get, merge, reset, delete flow works", async () => {
  clearAllStores();
  createStore("user", { name: "Alex", age: 25, profile: { color: "blue" } });

  setStore("user", "name", "Jordan");
  setStore("user", "profile.color", "red");
  setStore("user", { role: "admin" });

  assert.deepStrictEqual(getStore("user"), {
    name: "Jordan",
    age: 25,
    profile: { color: "red" },
    role: "admin",
  });

  resetStore("user");
  assert.deepStrictEqual(getStore("user"), { name: "Alex", age: 25, profile: { color: "blue" } });

  deleteStore("user");
  assert.strictEqual(getStore("user"), null);
  assert.strictEqual(hasStore("user"), false);
});

test("subscribers are notified and can unsubscribe", async () => {
  clearAllStores();
  const seen: Array<{ value: number } | null> = [];
  createStore("counter", { value: 0 });

  const off = _subscribe("counter", (value) => {
    seen.push(value as { value: number } | null);
  });

  setStore("counter", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  off();

  setStore("counter", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(getStore("counter"), { value: 2 });
  assert.ok(seen.some((entry) => entry && entry.value === 1));
});

test("subscribeWithSelector skips unrelated updates", async () => {
  clearAllStores();
  const seen: Array<{ next: number; prev: number }> = [];

  createStore("selectorUser", {
    profile: { count: 1 },
    other: 0,
  });

  const unsubscribe = subscribeWithSelector(
    "selectorUser",
    (state) => state.profile.count,
    Object.is,
    (next, prev) => {
      seen.push({ next, prev });
    }
  );

  setStore("selectorUser", "other", 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  setStore("selectorUser", "profile.count", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));

  unsubscribe();

  assert.deepStrictEqual(seen, [{ next: 2, prev: 1 }]);
});

test("createStore and hydrateStores reject forbidden store names", () => {
  clearAllStores();

  const created = createStore("__proto__", { polluted: true });
  assert.strictEqual(created, undefined);
  assert.strictEqual(hasStore("__proto__"), false);

  const snapshot = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"valid":{"ok":true}}');
  const result = hydrateStores(snapshot, {}, { allowUntrusted: true });

  const protoFail = result.failed.find((entry) => entry.name === "__proto__");
  const ctorFail = result.failed.find((entry) => entry.name === "constructor");
  assert.strictEqual(protoFail?.reason, "invalid-name");
  assert.strictEqual(ctorFail?.reason, "invalid-name");
  assert.deepStrictEqual(result.created, ["valid"]);
  assert.strictEqual(hasStore("valid"), true);
  assert.strictEqual(({} as any).polluted, undefined);
});

test("mutator return values are rejected in strict mode", () => {
  clearAllStores();
  createStore("mutatorReturn", { count: 1 });

  const result = setStore("mutatorReturn", (draft: any) => {
    draft.count = 2;
    return { count: 5 };
  });

  assert.deepStrictEqual(result, { ok: false, reason: "validate" });
  assert.deepStrictEqual(getStore("mutatorReturn"), { count: 1 });
});

test("mutator draft becomes the committed value", () => {
  clearAllStores();
  createStore("draftReuse", { count: 0 });

  let draftRef: any = null;
  setStore("draftReuse", (draft: any) => {
    draftRef = draft;
    draft.count = 1;
  });

  assert.strictEqual(_getStoreValueRef("draftReuse"), draftRef);
});

test("ref snapshots are shallowly frozen in dev", () => {
  clearAllStores();
  createStore("refStore", { profile: { name: "Alex" } }, { snapshot: "ref" });

  const snapshot = _getSnapshot("refStore") as any;
  assert.ok(Object.isFrozen(snapshot));
  assert.strictEqual(Object.isFrozen(snapshot.profile), false);

  snapshot.profile.name = "Jordan";
  assert.deepStrictEqual(getStore("refStore"), { profile: { name: "Jordan" } });
});

test("getStore respects snapshot modes (deep/shallow/ref)", () => {
  clearAllStores();
  createStore("snapDeep", { nested: { count: 1 } }, { snapshot: "deep" });
  createStore("snapShallow", { nested: { count: 1 } }, { snapshot: "shallow" });
  createStore("snapRef", { nested: { count: 1 } }, { snapshot: "ref" });

  const deep1 = getStore("snapDeep") as { nested: { count: number } };
  const deep2 = getStore("snapDeep") as { nested: { count: number } };
  assert.notStrictEqual(deep1, deep2);
  assert.notStrictEqual(deep1.nested, deep2.nested);

  const shallow1 = getStore("snapShallow") as { nested: { count: number } };
  const shallow2 = getStore("snapShallow") as { nested: { count: number } };
  assert.notStrictEqual(shallow1, shallow2);
  assert.strictEqual(shallow1.nested, shallow2.nested);

  const ref1 = getStore("snapRef") as { nested: { count: number } };
  const ref2 = getStore("snapRef") as { nested: { count: number } };
  assert.strictEqual(ref1, ref2);

  const refNested1 = getStore("snapRef", "nested") as { count: number };
  const refNested2 = getStore("snapRef", "nested") as { count: number };
  assert.strictEqual(refNested1, refNested2);
});

test("createComputed derives and updates from dependencies", async () => {
  clearAllStores();
  createStore("firstName", "Alex");
  createStore("lastName", "Stone");

  const fullName = createComputed(
    "fullName",
    ["firstName", "lastName"],
    (first, last) => `${first} ${last}`
  );

  assert.strictEqual(getStore("fullName"), "Alex Stone");

  replaceStore("firstName", "Jordan");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.strictEqual(getStore("fullName"), "Jordan Stone");
});


