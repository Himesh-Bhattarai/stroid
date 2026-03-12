import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  setStore,
  getStore,
  resetStore,
  deleteStore,
  hasStore,
  hydrateStores,
  _subscribe,
} from "../src/store.js";
import { clearAllStores } from "../src/runtime-admin.js";
import { subscribeWithSelector } from "../src/selectors.js";
import { createComputed } from "../src/computed.js";

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
  const result = hydrateStores(snapshot);

  assert.strictEqual(result.failed["__proto__"], "invalid-name");
  assert.strictEqual(result.failed["constructor"], "invalid-name");
  assert.deepStrictEqual(result.created, ["valid"]);
  assert.strictEqual(hasStore("valid"), true);
  assert.strictEqual(({} as any).polluted, undefined);
});

test("mutator return values replace draft updates", () => {
  clearAllStores();
  createStore("mutatorReturn", { count: 1 });

  setStore("mutatorReturn", (draft: any) => {
    draft.count = 2;
    return { count: 5 };
  });

  assert.deepStrictEqual(getStore("mutatorReturn"), { count: 5 });
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

  setStore("firstName", () => "Jordan");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.strictEqual(getStore("fullName"), "Jordan Stone");
});
