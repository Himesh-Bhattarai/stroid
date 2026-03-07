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
  _subscribe,
  hydrateStores,
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

test("createStore refuses to overwrite existing store", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  createStore("user", { name: "Jordan" });
  assert.deepStrictEqual(getStore("user"), { name: "Alex" });
});

test("setStore enforces schema on updates", () => {
  clearAllStores();
  let errorMsg: string | undefined;
  const schema = (v: any) => (typeof v?.name === "string" ? v : false);
  createStore("user", { name: "Alex" }, { schema, onError: (msg) => { errorMsg = msg; } });
  // bad type: name as number
  // @ts-expect-error runtime guard
  setStore("user", { name: 123 });
  assert.strictEqual(getStore("user", "name"), "Alex");
  assert.ok(errorMsg?.includes("Schema validation failed"));
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

test("setStore updates existing array indices without changing shape", () => {
  clearAllStores();
  createStore("list", { items: [1, 2, 3] });
  setStore("list", "items.1", 99);
  assert.deepStrictEqual(getStore("list"), { items: [1, 99, 3] });
});

test("setStore refuses to create missing array indices", () => {
  clearAllStores();
  createStore("list", { items: [1, 2] });
  setStore("list", "items.5", 42);
  assert.deepStrictEqual(getStore("list"), { items: [1, 2] });
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

test("getStore returns deep-cloned snapshots", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" }, items: [{ id: 1 }] });

  const snapshot = getStore("user") as any;
  snapshot.profile.color = "red";
  snapshot.items[0].id = 2;

  const pathSnapshot = getStore("user", "profile") as any;
  pathSnapshot.color = "green";

  assert.deepStrictEqual(getStore("user"), {
    profile: { color: "blue" },
    items: [{ id: 1 }],
  });
});

test("resetStore resets back to initial value", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", "name", "Jordan");
  resetStore("user");
  assert.strictEqual(getStore("user", "name"), "Alex");
});

test("hydrateStores skips invalid schema payloads and keeps reset state intact", () => {
  clearAllStores();
  const errors: string[] = [];
  const schema = (v: any) => (typeof v?.name === "string" ? v : false);

  createStore("profile", { name: "Alex" }, {
    schema,
    onError: (msg) => { errors.push(`profile:${msg}`); },
  });

  hydrateStores(
    {
      profile: { name: 123 },
      ghost: { name: 456 },
    },
    {
      default: {
        schema,
        onError: (msg) => { errors.push(`hydrate:${msg}`); },
      },
    }
  );

  assert.deepStrictEqual(getStore("profile"), { name: "Alex" });
  resetStore("profile");
  assert.deepStrictEqual(getStore("profile"), { name: "Alex" });
  assert.strictEqual(hasStore("ghost"), false);
  assert.ok(errors.some((msg) => msg.includes('Schema validation failed for "ghost"')));
});

test("middleware errors do not block later notifications", async () => {
  clearAllStores();
  const errors: string[] = [];
  const seen: Array<Record<string, string> | null> = [];

  createStore("prefs", { theme: "dark" }, {
    middleware: [() => { throw new Error("boom"); }],
    onError: (msg) => { errors.push(msg); },
  });

  const unsubscribe = _subscribe("prefs", (value) => {
    seen.push(value as Record<string, string> | null);
  });

  assert.doesNotThrow(() => {
    setStore("prefs", { theme: "light" });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  setStore("prefs", { theme: "blue" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  unsubscribe();

  assert.deepStrictEqual(getStore("prefs"), { theme: "blue" });
  assert.deepStrictEqual(seen, [{ theme: "light" }, { theme: "blue" }]);
  assert.ok(errors.some((msg) => msg.includes('Middleware for "prefs" failed')));
});

test("sync setup without BroadcastChannel surfaces via onError", () => {
  clearAllStores();
  const errors: string[] = [];

  createStore("shared", { count: 1 }, {
    sync: true,
    onError: (msg) => { errors.push(msg); },
  });

  assert.ok(errors.some((msg) => msg.includes('BroadcastChannel not available')));
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
