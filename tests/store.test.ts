import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  _getSnapshot,
  hydrateStores,
  getHistory,
  createStoreForRequest,
  getInitialState,
  getStoreMeta,
  subscribeWithSelector,
  createEntityStore,
  createSelector,
  setStoreBatch,
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

test("undefined stores are tracked and can be deleted cleanly", () => {
  clearAllStores();
  createStore("maybe", undefined);

  assert.strictEqual(hasStore("maybe"), true);
  assert.ok(listStores().includes("maybe"));
  assert.strictEqual(getStore("maybe"), undefined);
  assert.strictEqual(_getSnapshot("maybe"), undefined);

  deleteStore("maybe");
  assert.strictEqual(hasStore("maybe"), false);
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

test("setStore does not reshape primitive stores with object merges", () => {
  clearAllStores();
  createStore("count", 1);

  setStore("count", { bad: true } as any);
  assert.strictEqual(getStore("count"), 1);
});

test("validator exceptions are reported without throwing", () => {
  clearAllStores();
  const errors: string[] = [];

  assert.doesNotThrow(() => {
    createStore("user", { score: 0 }, {
      onError: (msg) => { errors.push(msg); },
      validator: () => {
        throw new Error("boom");
      },
    });
  });

  assert.strictEqual(hasStore("user"), false);

  createStore("safeUser", { score: 0 }, {
    onError: (msg) => { errors.push(msg); },
    validator: (next: any) => next.score <= 10,
  });

  assert.doesNotThrow(() => {
    setStore("safeUser", { score: 2 });
  });
  assert.deepStrictEqual(getStore("safeUser"), { score: 2 });

  let mergeChecks = 0;
  createStore("mergeUser", { score: 0 }, {
    onError: (msg) => { errors.push(msg); },
    validator: () => {
      mergeChecks += 1;
      if (mergeChecks > 1) {
        throw new Error("merge boom");
      }
      return true;
    },
  });

  assert.doesNotThrow(() => {
    mergeStore("mergeUser", { score: 1 });
  });
  assert.deepStrictEqual(getStore("mergeUser"), { score: 0 });
  assert.ok(errors.some((msg) => msg.includes('Validator for "user" failed')));
  assert.ok(errors.some((msg) => msg.includes('Validator for "mergeUser" failed')));
});

test("sanitize errors are reported without throwing on circular input", () => {
  clearAllStores();
  const errors: string[] = [];
  const circular: any = { value: 1 };
  circular.self = circular;

  assert.doesNotThrow(() => {
    createStore("circularCreate", circular, {
      onError: (msg) => { errors.push(msg); },
    });
  });
  assert.strictEqual(hasStore("circularCreate"), false);

  createStore("circularSet", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
  });
  assert.doesNotThrow(() => {
    setStore("circularSet", { loop: circular } as any);
  });
  assert.deepStrictEqual(getStore("circularSet"), { value: 1 });

  createStore("circularMerge", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
  });
  assert.doesNotThrow(() => {
    mergeStore("circularMerge", { loop: circular } as any);
  });
  assert.deepStrictEqual(getStore("circularMerge"), { value: 1 });

  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "circularCreate"')));
  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "circularSet"')));
  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "circularMerge"')));
});

test("sanitize rejects non-JSON-safe values before they corrupt state", () => {
  clearAllStores();
  const errors: string[] = [];

  assert.doesNotThrow(() => {
    createStore("badBigInt", { id: 1n } as any, {
      onError: (msg) => { errors.push(msg); },
    });
  });
  assert.strictEqual(hasStore("badBigInt"), false);

  createStore("safeNumbers", { total: 1 }, {
    onError: (msg) => { errors.push(msg); },
  });
  assert.doesNotThrow(() => {
    setStore("safeNumbers", { total: Number.NaN } as any);
  });
  assert.deepStrictEqual(getStore("safeNumbers"), { total: 1 });

  createStore("safeMap", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
  });
  const badMap = new Map<any, any>([[{ id: 1 }, "bad"]]);
  assert.doesNotThrow(() => {
    mergeStore("safeMap", { data: badMap } as any);
  });
  assert.deepStrictEqual(getStore("safeMap"), { value: 1 });

  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "badBigInt"')));
  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "safeNumbers"')));
  assert.ok(errors.some((msg) => msg.includes('Sanitize failed for "safeMap"')));
});

test("sanitize ignores inherited props and rejects accessor properties", () => {
  clearAllStores();
  const errors: string[] = [];

  const proto = { inherited: 123 };
  const payload = Object.create(proto) as Record<string, unknown>;
  payload.own = 1;
  createStore("plain", payload, {
    onError: (msg) => { errors.push(msg); },
  });
  assert.deepStrictEqual(getStore("plain"), { own: 1 });

  const accessorPayload: Record<string, unknown> = {};
  Object.defineProperty(accessorPayload, "danger", {
    enumerable: true,
    get() {
      throw new Error("getter should not run");
    },
  });

  assert.doesNotThrow(() => {
    createStore("accessor", accessorPayload as any, {
      onError: (msg) => { errors.push(msg); },
    });
  });
  assert.strictEqual(hasStore("accessor"), false);
  assert.ok(errors.some((msg) => msg.includes('Accessor properties are not supported during sanitize ("danger")')));
});

test("sanitize strips prototype pollution keys before merging into state", () => {
  clearAllStores();
  createStore("safeConfig", { enabled: true });

  const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"x":1},"safe":"ok"}');
  mergeStore("safeConfig", payload);

  assert.deepStrictEqual(getStore("safeConfig"), { enabled: true, safe: "ok" });
  assert.strictEqual(({} as any).polluted, undefined);
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

test("deepClone fallback stays deep when structuredClone is unavailable", async () => {
  const originalStructuredClone = (globalThis as any).structuredClone;
  try {
    delete (globalThis as any).structuredClone;
    const utils = await import(`../src/utils.js?deep-clone-fallback-${Date.now()}`);
    const circular: any = { nested: { value: 1 } };
    circular.self = circular;

    const clone = utils.deepClone(circular);
    clone.nested.value = 2;

    assert.notStrictEqual(clone, circular);
    assert.notStrictEqual(clone.nested, circular.nested);
    assert.strictEqual(circular.nested.value, 1);
    assert.strictEqual(clone.self, clone);
  } finally {
    (globalThis as any).structuredClone = originalStructuredClone;
  }
});

test("escaped dot paths and entity helpers support literal dotted keys", () => {
  clearAllStores();
  createStore("files", { "a.b": 1, nested: { "c.d": 2 } });

  assert.strictEqual(getStore("files", "a\\.b"), 1);
  assert.strictEqual(getStore("files", "nested.c\\.d"), 2);

  setStore("files", "a\\.b", 3);
  setStore("files", ["nested", "c.d"], 4);

  assert.deepStrictEqual(getStore("files"), { "a.b": 3, nested: { "c.d": 4 } });

  const entities = createEntityStore<{ id: string; name: string }>("entityDotIds");
  entities.upsert({ id: "a.b", name: "dotted" });

  assert.deepStrictEqual(entities.get("a.b"), { id: "a.b", name: "dotted" });
});

test("_getSnapshot returns stable cloned snapshots", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" } });

  const first = _getSnapshot("user") as any;
  const second = _getSnapshot("user") as any;
  assert.strictEqual(first, second);

  first.profile.color = "red";
  assert.deepStrictEqual(getStore("user"), { profile: { color: "blue" } });

  setStore("user", { profile: { color: "green" } });
  const third = _getSnapshot("user") as any;
  assert.notStrictEqual(third, first);
  assert.deepStrictEqual(third, { profile: { color: "green" } });
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

test("hydrateStores replaces existing primitive and array stores", () => {
  clearAllStores();
  createStore("count", 1);
  createStore("list", [1, 2]);

  hydrateStores({
    count: 2,
    list: [3, 4, 5],
  });

  assert.strictEqual(getStore("count"), 2);
  assert.deepStrictEqual(getStore("list"), [3, 4, 5]);
});

test("createStoreForRequest updates falsy buffered values", () => {
  const scoped = createStoreForRequest(({ create, set }) => {
    create("count", 0);
    create("flag", false);
    create("empty", "");
    set("count", 1);
    set("flag", true);
    set("empty", "filled");
  });

  assert.deepStrictEqual(scoped.snapshot(), {
    count: 1,
    flag: true,
    empty: "filled",
  });
});

test("createStoreForRequest rejects updates for unknown stores", () => {
  assert.throws(() => {
    createStoreForRequest(({ set }) => {
      set("missing", 1);
    });
  }, /requires create\("missing"/);
});

test("getInitialState returns original initial values", () => {
  clearAllStores();
  createStore("user", { value: 1 });
  setStore("user", { value: 2 });

  assert.deepStrictEqual(getInitialState(), {
    user: { value: 1 },
  });
});

test("getStoreMeta returns deep-cloned metadata snapshots", () => {
  clearAllStores();
  createStore("user", { value: 1 }, { historyLimit: 50 });

  const meta = getStoreMeta("user")!;
  meta.options.historyLimit = 0;
  meta.metrics.notifyCount = 999;

  const nextMeta = getStoreMeta("user")!;
  assert.strictEqual(nextMeta.options.historyLimit, 50);
  assert.notStrictEqual(nextMeta.metrics.notifyCount, 999);
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

test("subscriber-triggered updates schedule a follow-up notification", async () => {
  clearAllStores();
  const seen: number[] = [];

  createStore("loop", { value: 0 });
  _subscribe("loop", (value) => {
    if (!value) return;
    seen.push((value as { value: number }).value);
    if ((value as { value: number }).value === 1) {
      setStore("loop", { value: 2 });
    }
  });

  setStore("loop", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, [1, 2]);
  assert.deepStrictEqual(getStore("loop"), { value: 2 });
});

test("subscribeWithSelector ignores unrelated object updates", async () => {
  clearAllStores();
  const seen: Array<{ next: Record<string, number>; prev: Record<string, number> }> = [];

  createStore("selectorUser", {
    profile: { count: 1 },
    other: 0,
  });

  const unsubscribe = subscribeWithSelector(
    "selectorUser",
    (state) => state.profile,
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

  assert.deepStrictEqual(seen, [
    {
      next: { count: 2 },
      prev: { count: 1 },
    },
  ]);
});

test("createSelector skips recomputation when tracked paths are unchanged", () => {
  clearAllStores();
  createStore("selectorMemo", {
    profile: { name: "Alex" },
    other: 0,
  });

  let runs = 0;
  const selectName = createSelector("selectorMemo", (state: any) => {
    runs += 1;
    return state.profile.name;
  });

  assert.strictEqual(selectName(), "Alex");
  assert.strictEqual(runs, 1);

  setStore("selectorMemo", "other", 1);
  assert.strictEqual(selectName(), "Alex");
  assert.strictEqual(runs, 1);

  setStore("selectorMemo", "profile.name", "Jordan");
  assert.strictEqual(selectName(), "Jordan");
  assert.strictEqual(runs, 2);
});

test("setStoreBatch rejects async callbacks before they can interleave state", () => {
  clearAllStores();
  createStore("batchGuard", { value: 0 });

  assert.throws(() => {
    setStoreBatch(async () => {
      setStore("batchGuard", { value: 1 });
      await Promise.resolve();
      setStore("batchGuard", { value: 2 });
    });
  }, /does not support async functions/);

  assert.deepStrictEqual(getStore("batchGuard"), { value: 0 });
});

test("lifecycle hook errors do not leave partial commits", () => {
  clearAllStores();
  const errors: string[] = [];

  assert.doesNotThrow(() => {
    createStore("createUser", { value: 1 }, {
      onError: (msg) => { errors.push(msg); },
      onCreate: () => { throw new Error("create boom"); },
    });
  });
  assert.deepStrictEqual(getStore("createUser"), { value: 1 });

  createStore("setUser", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
    onSet: () => { throw new Error("set boom"); },
  });
  assert.doesNotThrow(() => {
    setStore("setUser", { value: 2 });
  });
  assert.deepStrictEqual(getStore("setUser"), { value: 2 });
  assert.strictEqual(getHistory("setUser").at(-1)?.action, "set");

  createStore("resetUser", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
    onReset: () => { throw new Error("reset boom"); },
  });
  setStore("resetUser", { value: 2 });
  assert.doesNotThrow(() => {
    resetStore("resetUser");
  });
  assert.deepStrictEqual(getStore("resetUser"), { value: 1 });
  assert.strictEqual(getHistory("resetUser").at(-1)?.action, "reset");

  createStore("deleteUser", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
    onDelete: () => { throw new Error("delete boom"); },
  });
  assert.doesNotThrow(() => {
    deleteStore("deleteUser");
  });
  assert.strictEqual(hasStore("deleteUser"), false);

  assert.ok(errors.some((msg) => msg.includes('onCreate for "createUser" failed')));
  assert.ok(errors.some((msg) => msg.includes('onSet for "setUser" failed')));
  assert.ok(errors.some((msg) => msg.includes('onReset for "resetUser" failed')));
  assert.ok(errors.some((msg) => msg.includes('onDelete for "deleteUser" failed')));
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

test("deleteStore still cleans up when a subscriber throws", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  _subscribe("user", (value) => {
    if (value === null) throw new Error("delete subscriber boom");
  });

  assert.doesNotThrow(() => {
    deleteStore("user");
  });
  assert.strictEqual(hasStore("user"), false);
});

test("deleteStore clears orphaned history entries", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", { name: "Jordan" });

  assert.ok(getHistory("user").length > 0);
  deleteStore("user");
  assert.deepStrictEqual(getHistory("user"), []);
});

test("history snapshots stay immutable in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const store = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    store.createStore("user", { profile: { color: "blue" } }, { allowSSRGlobalStore: true });
    store.setStore("user", { profile: { color: "green" } });

    const history = store.getHistory("user");
    history[1].next.profile.color = "red";

    assert.deepStrictEqual(store.getHistory("user")[1].next, { profile: { color: "green" } });

    const live = store.getStore("user");
    live.profile.color = "purple";

    assert.deepStrictEqual(store.getHistory("user")[1].next, { profile: { color: "green" } });
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
