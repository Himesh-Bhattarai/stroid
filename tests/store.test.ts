import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  setStore,
  getStore,
  deleteStore,
  resetStore,
  mergeStore,
  hasStore,
  listStores,
  clearAllStores,
} from "../src/store.js";

test("createStore with object data", () => {
  clearAllStores();
  createStore("user", { name: "Alex", age: 25 });
  assert.deepStrictEqual(getStore("user"), { name: "Alex", age: 25 });
});

test("createStore with number", () => {
  clearAllStores();
  createStore("count", 0);
  assert.strictEqual(getStore("count"), 0);
});

test("createStore blocks production server globals unless explicitly allowed", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  clearAllStores();

  const blocked = createStore("ssr", { value: 1 });
  assert.strictEqual(blocked, undefined);
  assert.strictEqual(hasStore("ssr"), false);

  createStore("ssrAllowed", { value: 2 }, { allowSSRGlobalStore: true });
  assert.strictEqual(hasStore("ssrAllowed"), true);

  process.env.NODE_ENV = originalEnv;
  clearAllStores();
});

test("setStore updates a single field", () => {
  clearAllStores();
  createStore("user", { name: "Alex", age: 25 });
  setStore("user", "name", "Jordan");
  assert.strictEqual(getStore("user", "name"), "Jordan");
  assert.strictEqual(getStore("user", "age"), 25);
});

test("setStore updates with dot notation", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" } });
  setStore("user", "profile.color", "red");
  assert.strictEqual(getStore("user", "profile.color"), "red");
});

test("setStore updates with full object", () => {
  clearAllStores();
  createStore("user", { name: "Alex", age: 25 });
  setStore("user", { name: "Jordan" });
  assert.strictEqual(getStore("user", "name"), "Jordan");
  assert.strictEqual(getStore("user", "age"), 25);
});

test("setStore rejects unknown paths", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", "nam", "Jordan");
  assert.deepStrictEqual(getStore("user"), { name: "Alex" });
});

test("setStore blocks type mismatches", () => {
  clearAllStores();
  let errorMessage: string | undefined;
  createStore("user", { name: "Alex" }, { onError: (msg) => { errorMessage = msg; } });
  // @ts-expect-error intentional bad type for runtime guard
  setStore("user", "name", 123);
  assert.strictEqual(getStore("user", "name"), "Alex");
  assert.ok(errorMessage?.includes("Type mismatch"));
});

test("getStore returns null for missing store", () => {
  clearAllStores();
  assert.strictEqual(getStore("ghost"), null);
});

test("resetStore resets back to initial value", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", "name", "Jordan");
  resetStore("user");
  assert.strictEqual(getStore("user", "name"), "Alex");
});

test("mergeStore adds fields without removing old ones", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  mergeStore("user", { role: "admin" });
  assert.deepStrictEqual(getStore("user"), { name: "Alex", role: "admin" });
});

test("hasStore and listStores", () => {
  clearAllStores();
  createStore("user", {});
  createStore("cart", {});
  assert.strictEqual(hasStore("user"), true);
  assert.strictEqual(hasStore("ghost"), false);
  const list = listStores();
  assert.ok(list.includes("user"));
  assert.ok(list.includes("cart"));
});

test("deleteStore removes store", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  deleteStore("user");
  assert.strictEqual(hasStore("user"), false);
});
