/**
 * @fileoverview tests\helpers.test.ts
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores } from "../src/runtime-admin.js";
import { createCounterStore, createEntityStore, createListStore } from "../src/helpers.js";

test("createCounterStore supports inc, dec, set, reset, and get", () => {
  clearAllStores();
  const counter = createCounterStore("counter", 2);

  assert.strictEqual(counter.get(), 2);
  counter.inc();
  counter.inc(3);
  counter.dec();
  counter.dec(2);
  assert.strictEqual(counter.get(), 3);

  counter.set(10);
  assert.strictEqual(counter.get(), 10);

  counter.reset();
  assert.strictEqual(counter.get(), 2);
});

test("createListStore supports push, removeAt, replace, clear, and all", () => {
  clearAllStores();
  const list = createListStore<string>("todos", ["a"]);

  list.push("b");
  assert.deepStrictEqual(list.all(), ["a", "b"]);

  list.removeAt(0);
  assert.deepStrictEqual(list.all(), ["b"]);

  list.replace(["x", "y"]);
  const snapshot = list.all();
  snapshot.push("z");
  assert.deepStrictEqual(list.all(), ["x", "y"]);

  list.clear();
  assert.deepStrictEqual(list.all(), []);
});

test("createEntityStore supports upsert, get, all, remove, and clear", () => {
  clearAllStores();
  const entities = createEntityStore<{ id: string; name: string }>("entities");

  entities.upsert({ id: "a", name: "Alpha" });
  entities.upsert({ id: "b", name: "Beta" });

  assert.deepStrictEqual(entities.get("a"), { id: "a", name: "Alpha" });
  assert.deepStrictEqual(entities.get("missing"), null);
  assert.deepStrictEqual(
    entities.all().map((entity) => entity.id),
    ["a", "b"]
  );

  entities.remove("a");
  assert.strictEqual(entities.get("a"), null);
  assert.deepStrictEqual(entities.all().map((entity) => entity.id), ["b"]);

  entities.clear();
  assert.deepStrictEqual(entities.all(), []);
});

