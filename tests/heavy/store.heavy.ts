import test from "node:test";
import assert from "node:assert";
import "../../src/persist.js";
import "../../src/sync.js";
import "../../src/devtools.js";
import { devDeepFreeze } from "../../src/devfreeze.js";
import { getHistory, clearHistory } from "../../src/devtools.js";
import { clearAllStores } from "../../src/runtime-admin.js";
import {
  listStores,
  getInitialState,
  getStoreMeta,
  getMetrics,
} from "../../src/runtime-tools.js";
import {
  createStore,
  setStore,
  getStore,
  deleteStore,
  resetStore,
  hasStore,
  _subscribe,
  _getSnapshot,
  hydrateStores,
  setStoreBatch,
} from "../../src/store.js";
import { createCounterStore, createListStore, createEntityStore } from "../../src/helpers.js";
import { fetchStore, refetchStore } from "../../src/async.js";
import { subscribeWithSelector, createSelector } from "../../src/selectors.js";
import { createStoreForRequest } from "../../src/server.js";

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

test("devDeepFreeze handles deeply nested and circular objects without overflowing", () => {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let i = 0; i < 20_000; i++) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  cursor.loop = root;

  assert.doesNotThrow(() => {
    devDeepFreeze(root);
  });
  assert.strictEqual(Object.isFrozen(root), true);
  assert.strictEqual(Object.isFrozen(root.next as object), true);
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
  createStore("user", { name: "Alex" }, { validate: schema, onError: (msg) => { errorMsg = msg; } });
  // bad type: name as number
  // @ts-expect-error runtime guard
  setStore("user", { name: 123 });
  assert.strictEqual(getStore("user", "name"), "Alex");
  assert.ok(errorMsg?.includes('Validation blocked update for "user"'));
});

test("createStore blocks production server globals unless explicitly allowed", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  const reported: string[] = [];
  process.env.NODE_ENV = "production";
  clearAllStores();
  const errors: string[] = [];

  console.error = ((message?: unknown) => {
    reported.push(String(message ?? ""));
  }) as typeof console.error;

  try {
    const blocked = createStore("ssr", { value: 1 }, {
      onError: (msg) => { errors.push(msg); },
    });
    assert.strictEqual(blocked, undefined);
    assert.strictEqual(hasStore("ssr"), false);
    assert.ok(errors.some((msg) => msg.includes('createStore("ssr") is blocked on the server in production')));
    assert.ok(reported.some((msg) => msg.includes('createStore("ssr") is blocked on the server in production')));

    createStore("ssrAllowed", { value: 2 }, { allowSSRGlobalStore: true });
    assert.strictEqual(hasStore("ssrAllowed"), true);

    createStore("ssrScoped", { value: 3 }, { scope: "global" });
    assert.strictEqual(hasStore("ssrScoped"), true);
  } finally {
    console.error = originalConsoleError;
    process.env.NODE_ENV = originalEnv;
    clearAllStores();
  }
});


test("fetchStore metadata is cleared when store is deleted", async () => {
  clearAllStores();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => ({ value: 1 }),
    text: async () => JSON.stringify({ value: 1 }),
  })) as typeof fetch;

  try {
    await fetchStore("fetchDelete", "https://api.example.com/data");
    deleteStore("fetchDelete");
    const history = await refetchStore("fetchDelete");
    assert.strictEqual(history, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
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

test("setStore rejects unknown nested paths by default", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" } });
  setStore("user", "profile.size", "L");
  assert.deepStrictEqual(getStore("user"), { profile: { color: "blue" } });
});

test("setStore pathCreate option allows creating missing leaf keys", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" } }, { pathCreate: true });

  setStore("user", "nickname", "AJ");
  setStore("user", "profile.size", "L");

  assert.deepStrictEqual(getStore("user"), { nickname: "AJ", profile: { color: "blue", size: "L" } });
});

test("setStore pathCreate cannot be enabled after store creation", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });

  setStore("user", "age", 25);
  assert.deepStrictEqual(getStore("user"), { name: "Alex" });

  createStore("user", { name: "Alex" }, { pathCreate: true });
  setStore("user", "age", 25);
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
      validate: () => {
        throw new Error("boom");
      },
    });
  });

  assert.strictEqual(hasStore("user"), false);

  createStore("safeUser", { score: 0 }, {
    onError: (msg) => { errors.push(msg); },
    validate: (next: any) => next.score <= 10,
  });

  assert.doesNotThrow(() => {
    setStore("safeUser", { score: 2 });
  });
  assert.deepStrictEqual(getStore("safeUser"), { score: 2 });

  let mergeChecks = 0;
  createStore("mergeUser", { score: 0 }, {
    onError: (msg) => { errors.push(msg); },
    validate: () => {
      mergeChecks += 1;
      if (mergeChecks > 1) {
        throw new Error("merge boom");
      }
      return true;
    },
  });

  assert.doesNotThrow(() => {
    setStore("mergeUser", { score: 1 });
  });
  assert.deepStrictEqual(getStore("mergeUser"), { score: 0 });
  assert.ok(errors.some((msg) => msg.includes('Validation for "user" failed')));
  assert.ok(errors.some((msg) => msg.includes('Validation for "mergeUser" failed')));
});

test("validator failures do not call the same onError handler twice", () => {
  clearAllStores();
  const messages: string[] = [];
  const onError = (msg: string) => {
    messages.push(msg);
  };

  createStore("validatorOnce", { value: 1 }, {
    onError,
    validate: (next: any) => next.value < 2,
  });

  setStore("validatorOnce", { value: 2 });
  assert.deepStrictEqual(messages, ['Validation blocked update for "validatorOnce"']);

  messages.length = 0;

  const blocked = createStore("validatorInitOnce", { value: 2 }, {
    onError,
    validate: (next: any) => next.value < 2,
  });

  assert.strictEqual(blocked, undefined);
  assert.deepStrictEqual(messages, ['Validation blocked update for "validatorInitOnce"']);
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
    setStore("circularMerge", { loop: circular } as any);
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
    setStore("safeMap", { data: badMap } as any);
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
  setStore("safeConfig", payload);

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
    const utils = await import(`../../src/utils.js?deep-clone-fallback-${Date.now()}`);
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

test("deepClone fallback drops inherited and non-enumerable object state", async () => {
  const originalStructuredClone = (globalThis as any).structuredClone;
  try {
    delete (globalThis as any).structuredClone;
    const utils = await import(`../../src/utils.js?deep-clone-fallback-shape-${Date.now()}`);

    const source = Object.create({ admin: true }) as Record<string, unknown>;
    source.name = "Alex";
    Object.defineProperty(source, "_secret", {
      value: "hidden",
      enumerable: false,
    });

    const clone = utils.deepClone(source) as Record<string, unknown>;

    assert.deepStrictEqual(clone, { name: "Alex" });
    assert.strictEqual("admin" in clone, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(clone, "_secret"), false);
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

test("createEntityStore fallback ids stay unique under repeated timestamps", () => {
  clearAllStores();
  const realDateNow = Date.now;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  Date.now = () => 1234;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });

  try {
    const entities = createEntityStore<{ name: string }>("entityFallbackIds");
    entities.upsert({ name: "first" });
    entities.upsert({ name: "second" });

    assert.strictEqual(entities.all().length, 2);
  } finally {
    Date.now = realDateNow;
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    } else {
      delete (globalThis as any).crypto;
    }
  }
});

test("createCounterStore supports increment, decrement, set, reset, and get", () => {
  clearAllStores();
  const counter = createCounterStore("counter", 2);

  assert.strictEqual(counter.get(), 2);

  counter.inc();
  counter.inc(3);
  counter.dec(2);
  assert.strictEqual(counter.get(), 4);

  counter.set(9);
  assert.strictEqual(counter.get(), 9);
  assert.deepStrictEqual(getStore("counter"), { value: 9 });

  counter.reset();
  assert.strictEqual(counter.get(), 2);
});

test("createListStore supports push, removeAt, replace, clear, and all", () => {
  clearAllStores();
  const list = createListStore("todos", ["a"]);

  list.push("b");
  list.push("c");
  assert.deepStrictEqual(list.all(), ["a", "b", "c"]);

  list.removeAt(1);
  assert.deepStrictEqual(list.all(), ["a", "c"]);

  list.replace(["x", "y"]);
  assert.deepStrictEqual(list.all(), ["x", "y"]);
  assert.deepStrictEqual(getStore("todos"), { items: ["x", "y"] });

  list.clear();
  assert.deepStrictEqual(list.all(), []);
});

test("createEntityStore supports remove and clear operations", () => {
  clearAllStores();
  const entities = createEntityStore<{ id: string; name: string }>("entityUsers");

  entities.upsert({ id: "1", name: "Alex" });
  entities.upsert({ id: "2", name: "Jordan" });
  assert.deepStrictEqual(entities.all(), [
    { id: "1", name: "Alex" },
    { id: "2", name: "Jordan" },
  ]);

  entities.remove("1");
  assert.deepStrictEqual(entities.all(), [{ id: "2", name: "Jordan" }]);
  assert.strictEqual(entities.get("1"), undefined);

  entities.clear();
  assert.deepStrictEqual(entities.all(), []);
  assert.deepStrictEqual(getStore("entityUsers"), { entities: {}, ids: [] });
});

test("_getSnapshot returns stable cloned snapshots", () => {
  clearAllStores();
  createStore("user", { profile: { color: "blue" } });

  const first = _getSnapshot("user") as any;
  const second = _getSnapshot("user") as any;
  assert.strictEqual(first, second);

  assert.throws(() => {
    first.profile.color = "red";
  });
  assert.deepStrictEqual(getStore("user"), { profile: { color: "blue" } });

  setStore("user", { profile: { color: "green" } });
  const third = _getSnapshot("user") as any;
  assert.notStrictEqual(third, first);
  assert.deepStrictEqual(third, { profile: { color: "green" } });
});

test("notify flush reuses the snapshot cache for getStoreSnapshot reads", async () => {
  clearAllStores();
  createStore("user", { profile: { name: "Alex" } });

  let fromSubscriber: unknown;
  const unsub = _subscribe("user", (state) => {
    fromSubscriber = state;
  });

  setStore("user", "profile.name", "Jordan");
  await Promise.resolve();

  assert.ok(fromSubscriber && typeof fromSubscriber === "object");
  assert.deepStrictEqual(fromSubscriber, { profile: { name: "Jordan" } });

  const snapshot = _getSnapshot("user");
  assert.strictEqual(snapshot, fromSubscriber);

  unsub();
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
    validate: schema,
    onError: (msg) => { errors.push(`profile:${msg}`); },
  });

  hydrateStores(
    {
      profile: { name: 123 },
      ghost: { name: 456 },
    },
    {
      default: {
        validate: schema,
        onError: (msg) => { errors.push(`hydrate:${msg}`); },
      },
    }
  );

  assert.deepStrictEqual(getStore("profile"), { name: "Alex" });
  resetStore("profile");
  assert.deepStrictEqual(getStore("profile"), { name: "Alex" });
  assert.strictEqual(hasStore("ghost"), false);
  assert.ok(errors.some((msg) => msg.includes('Validation blocked update for "ghost"')));
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

test("hydrateStores allows null whole-store replacement but blocks undefined replacement", () => {
  clearAllStores();
  createStore("nullableHydrate", { value: 1 });

  hydrateStores({
    nullableHydrate: null,
  });
  assert.strictEqual(getStore("nullableHydrate"), null);

  hydrateStores({
    nullableHydrate: undefined,
  });
  assert.strictEqual(getStore("nullableHydrate"), null);
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

test("createStoreForRequest hydrates buffered store options", () => {
  clearAllStores();
  const errors: string[] = [];
  const scoped = createStoreForRequest(({ create }) => {
    create("scopedProfile", { value: 1 }, {
      validate: (value: any) => (typeof value?.value === "number" ? value : false),
      onError: (msg) => { errors.push(msg); },
    });
  });

  let snapshot: unknown = null;
  scoped.hydrate(() => {
    setStore("scopedProfile", { value: "bad" as any });
    snapshot = getStore("scopedProfile");
    return undefined;
  });

  assert.deepStrictEqual(snapshot, { value: 1 });
  assert.ok(errors.some((msg) => msg.includes('Validation blocked update for "scopedProfile"')));
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

test("store metadata preserves scope semantics", () => {
  clearAllStores();

  createStore("tempMeta", { open: true }, { scope: "temp" });
  createStore("globalMeta", { theme: "light" }, { scope: "global" });
  createStore("requestMeta", { step: 1 });

  const tempMeta = getStoreMeta("tempMeta")!;
  const globalMeta = getStoreMeta("globalMeta")!;
  const requestMeta = getStoreMeta("requestMeta")!;

  assert.strictEqual(tempMeta.options.scope, "temp");
  assert.strictEqual(tempMeta.options.persist, null);
  assert.strictEqual(tempMeta.options.sync, false);
  assert.strictEqual(tempMeta.options.historyLimit, 0);

  assert.strictEqual(globalMeta.options.scope, "global");
  assert.strictEqual(globalMeta.options.allowSSRGlobalStore, true);

  assert.strictEqual(requestMeta.options.scope, "request");
  assert.strictEqual(requestMeta.options.allowSSRGlobalStore, false);
  assert.strictEqual(requestMeta.options.historyLimit, 50);
});

test("temp stores warn when persistence is explicitly enabled", () => {
  clearAllStores();
  const reported: string[] = [];
  const originalConsoleWarn = console.warn;
  console.warn = (message) => {
    reported.push(String(message ?? ""));
  };

  try {
    createStore("tempPersist", { open: true }, {
      scope: "temp",
      persist: true,
    });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.ok(
    reported.some((msg) =>
      msg.includes('Store "tempPersist" has scope: "temp" but persist is enabled.')
      && msg.includes("Temp stores are intended to be ephemeral.")
    )
  );
  assert.strictEqual(hasStore("tempPersist"), true);
  clearAllStores();
});

test("clearHistory supports per-store and global cleanup", () => {
  clearAllStores();
  createStore("firstHistory", { value: 1 });
  createStore("secondHistory", { value: 1 });

  setStore("firstHistory", { value: 2 });
  setStore("secondHistory", { value: 2 });

  assert.ok(getHistory("firstHistory").length > 0);
  assert.ok(getHistory("secondHistory").length > 0);

  clearHistory("firstHistory");
  assert.deepStrictEqual(getHistory("firstHistory"), []);
  assert.ok(getHistory("secondHistory").length > 0);

  clearHistory();
  assert.deepStrictEqual(getHistory("secondHistory"), []);
});

test("historyLimit keeps only the latest entries at the configured boundary", () => {
  clearAllStores();
  createStore("historyLimitStore", { value: 0 }, {
    devtools: { historyLimit: 2 },
  });

  setStore("historyLimitStore", { value: 1 });
  setStore("historyLimitStore", { value: 2 });
  setStore("historyLimitStore", { value: 3 });

  const history = getHistory("historyLimitStore");
  assert.strictEqual(history.length, 2);
  assert.deepStrictEqual(history.map((entry) => entry.action), ["set", "set"]);
  assert.deepStrictEqual(history.map((entry) => (entry.next as any).value), [2, 3]);
});

test("getMetrics reflects notifications and survives reset operations", async () => {
  clearAllStores();
  createStore("metricsStore", { value: 0 });
  _subscribe("metricsStore", () => undefined);

  const before = getMetrics("metricsStore");
  assert.deepStrictEqual(before, {
    notifyCount: 0,
    totalNotifyMs: 0,
    lastNotifyMs: 0,
  });

  setStore("metricsStore", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const afterSet = getMetrics("metricsStore");
  assert.ok(afterSet);
  assert.strictEqual(afterSet?.notifyCount, 1);
  assert.ok((afterSet?.totalNotifyMs ?? -1) >= 0);
  assert.ok((afterSet?.lastNotifyMs ?? -1) >= 0);

  resetStore("metricsStore");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const afterReset = getMetrics("metricsStore");
  assert.ok(afterReset);
  assert.strictEqual(afterReset?.notifyCount, 2);
  assert.ok((afterReset?.totalNotifyMs ?? -1) >= (afterSet?.totalNotifyMs ?? -1));
});

test("middleware runs in declaration order and receives action, name, prev, next, and path metadata", () => {
  clearAllStores();
  const calls: Array<{ label: string; action: string; name: string; prev: any; next: any; path: unknown }> = [];

  createStore("orderedMiddleware", { value: 1 }, {
    lifecycle: {
      middleware: [
        (ctx) => {
          calls.push({ label: "mw1", action: ctx.action, name: ctx.name, prev: ctx.prev, next: ctx.next, path: ctx.path });
          return { ...(ctx.next as Record<string, unknown>), value: (ctx.next as any).value + 1 };
        },
        (ctx) => {
          calls.push({ label: "mw2", action: ctx.action, name: ctx.name, prev: ctx.prev, next: ctx.next, path: ctx.path });
          return { ...(ctx.next as Record<string, unknown>), marker: "done" };
        },
      ],
    },
  });

  setStore("orderedMiddleware", "value", 2);

  assert.deepStrictEqual(calls, [
    {
      label: "mw1",
      action: "set",
      name: "orderedMiddleware",
      prev: { value: 1 },
      next: { value: 2 },
      path: "value",
    },
    {
      label: "mw2",
      action: "set",
      name: "orderedMiddleware",
      prev: { value: 1 },
      next: { value: 3 },
      path: "value",
    },
  ]);
  assert.deepStrictEqual(getStore("orderedMiddleware"), { value: 3, marker: "done" });
});

test("lifecycle hooks fire in operation order with committed values", () => {
  clearAllStores();
  const events: string[] = [];

  createStore("hookOrder", { value: 1 }, {
    lifecycle: {
      onCreate: (initial) => {
        events.push(`create:${(initial as any).value}`);
      },
      onSet: (prev, next) => {
        events.push(`set:${(prev as any).value}->${(next as any).value}`);
      },
      onReset: (prev, next) => {
        events.push(`reset:${(prev as any).value}->${(next as any).value}`);
      },
      onDelete: (prev) => {
        events.push(`delete:${(prev as any).value}`);
      },
    },
  });

  setStore("hookOrder", { value: 4 });
  resetStore("hookOrder");
  deleteStore("hookOrder");

  assert.deepStrictEqual(events, [
    "create:1",
    "set:1->4",
    "reset:4->1",
    "delete:1",
  ]);
});

test("grouped options normalize lifecycle, devtools, and validate paths", () => {
  clearAllStores();
  let created = 0;
  let sets = 0;

  createStore("grouped", { value: 1 }, {
    validate: (next: any) => typeof next?.value === "number",
    devtools: { historyLimit: 2 },
    lifecycle: {
      middleware: [({ next }) => ({ ...(next as Record<string, number>), value: (next as Record<string, number>).value + 1 })],
      onCreate: () => { created += 1; },
      onSet: () => { sets += 1; },
    },
  });

  setStore("grouped", { value: 2 });

  assert.strictEqual(created, 1);
  assert.strictEqual(sets, 1);
  assert.deepStrictEqual(getStore("grouped"), { value: 3 });
  assert.strictEqual(getStoreMeta("grouped")?.options.historyLimit, 2);
});

test("middleware throws veto the blocked update but allow later valid writes", async () => {
  clearAllStores();
  const errors: string[] = [];
  const seen: Array<Record<string, string> | null> = [];

  createStore("prefs", { theme: "dark" }, {
    middleware: [({ next }) => {
      if ((next as Record<string, string>).theme === "light") {
        throw new Error("boom");
      }
    }],
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
  assert.deepStrictEqual(seen, [{ theme: "blue" }]);
  assert.ok(errors.some((msg) => msg.includes('Middleware for "prefs" failed')));
});

test("promise-returning middleware is rejected before it can commit async state", () => {
  clearAllStores();
  const errors: string[] = [];

  createStore("asyncMiddleware", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
    middleware: [() => Promise.resolve({ value: 99 }) as any],
  });

  setStore("asyncMiddleware", { value: 2 });

  assert.deepStrictEqual(getStore("asyncMiddleware"), { value: 1 });
  assert.ok(errors.some((msg) => msg.includes('must be synchronous')));
});

test("middleware mutations are revalidated before commit", () => {
  clearAllStores();
  const errors: string[] = [];

  createStore("middlewareValidation", { count: 1 }, {
    validate: (value: any) => (typeof value?.count === "number" ? value : false),
    onError: (msg) => { errors.push(msg); },
    middleware: [({ next }) => {
      (next as { count: unknown }).count = "broken";
    }],
  });

  setStore("middlewareValidation", { count: 2 });

  assert.deepStrictEqual(getStore("middlewareValidation"), { count: 1 });
  assert.ok(errors.some((msg) => msg.includes('Validation')));
});

test("path writes allow replacing null leaves with objects", () => {
  clearAllStores();
  createStore("nullablePath", { user: null as null | { name: string } });

  setStore("nullablePath", "user", { name: "Alex" });

  assert.deepStrictEqual(getStore("nullablePath"), { user: { name: "Alex" } });
});

test("mutator errors report through onError instead of throwing out of setStore", () => {
  clearAllStores();
  const errors: string[] = [];

  createStore("mutatorErrors", { value: 1 }, {
    onError: (msg) => { errors.push(msg); },
  });

  assert.doesNotThrow(() => {
    setStore("mutatorErrors", () => {
      throw new Error("recipe boom");
    });
  });

  assert.deepStrictEqual(getStore("mutatorErrors"), { value: 1 });
  assert.ok(errors.some((msg) => msg.includes('Mutator for "mutatorErrors" failed: recipe boom')));
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

test("duplicate subscriber registration only notifies once for Set-based subscribers", async () => {
  clearAllStores();
  const seen: string[] = [];
  const listener = (value: any) => {
    seen.push(`dup:${value.value}`);
  };

  createStore("duplicateSubscribers", { value: 0 });
  _subscribe("duplicateSubscribers", listener);
  _subscribe("duplicateSubscribers", listener);

  setStore("duplicateSubscribers", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, ["dup:1"]);
});

test("duplicate subscriber unsubscriptions remove the single Set registration", async () => {
  clearAllStores();
  const seen: string[] = [];
  const listener = (value: any) => {
    seen.push(`dup:${value.value}`);
  };

  createStore("duplicateSubscriberOff", { value: 0 });
  const off1 = _subscribe("duplicateSubscriberOff", listener);
  const off2 = _subscribe("duplicateSubscriberOff", listener);

  off1();
  setStore("duplicateSubscriberOff", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  off2();
  setStore("duplicateSubscriberOff", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, []);
});

test("subscribers are notified in registration order", async () => {
  clearAllStores();
  const seen: string[] = [];

  createStore("orderedSubscribers", { value: 0 });
  _subscribe("orderedSubscribers", (value) => {
    seen.push(`first:${(value as { value: number }).value}`);
  });
  _subscribe("orderedSubscribers", (value) => {
    seen.push(`second:${(value as { value: number }).value}`);
  });

  setStore("orderedSubscribers", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, ["first:1", "second:1"]);
});

test("subscribers added during notify start on the next cycle", async () => {
  clearAllStores();
  const seen: string[] = [];

  createStore("subscribeDuringNotify", { value: 0 });

  let attached = false;
  _subscribe("subscribeDuringNotify", (value) => {
    seen.push(`first:${(value as { value: number }).value}`);
    if (attached) return;
    attached = true;
    _subscribe("subscribeDuringNotify", (nextValue) => {
      seen.push(`second:${(nextValue as { value: number }).value}`);
    });
  });

  setStore("subscribeDuringNotify", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  setStore("subscribeDuringNotify", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, [
    "first:1",
    "first:2",
    "second:2",
  ]);
});

test("unsubscribing another subscriber during notify does not break the current cycle", async () => {
  clearAllStores();
  const seen: string[] = [];

  createStore("unsubscribeDuringNotify", { value: 0 });

  let unsubscribeSecond = () => {};
  _subscribe("unsubscribeDuringNotify", (value) => {
    seen.push(`first:${(value as { value: number }).value}`);
    unsubscribeSecond();
  });
  unsubscribeSecond = _subscribe("unsubscribeDuringNotify", (value) => {
    seen.push(`second:${(value as { value: number }).value}`);
  });

  setStore("unsubscribeDuringNotify", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  setStore("unsubscribeDuringNotify", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(seen, [
    "first:1",
    "second:1",
    "first:2",
  ]);
});

test("subscribeWithSelector ignores unrelated object updates", async () => {
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

  assert.deepStrictEqual(seen, [
    { next: 2, prev: 1 },
  ]);
});

test("subscribeWithSelector can subscribe before createStore and activates when the store is created", async () => {
  clearAllStores();
  const seen: Array<{ next: string; prev: string }> = [];

  const unsubscribe = subscribeWithSelector(
    "lateSelectorStore",
    (state) => state.profile.name,
    Object.is,
    (next, prev) => {
      seen.push({ next, prev });
    }
  );

  assert.doesNotThrow(() => {
    createStore("lateSelectorStore", { profile: { name: "Alex" } });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  setStore("lateSelectorStore", "profile.name", "Jordan");
  await new Promise((resolve) => setTimeout(resolve, 0));

  unsubscribe();

  assert.deepStrictEqual(seen, [
    { next: "Alex", prev: "Alex" },
    { next: "Jordan", prev: "Alex" },
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

test("setStoreBatch flushes queued notifications before rejecting promise-returning callbacks", async () => {
  clearAllStores();
  createStore("batchPromiseGuard", { value: 0 });
  const seen: number[] = [];

  _subscribe("batchPromiseGuard", (value) => {
    if (!value) return;
    seen.push((value as { value: number }).value);
  });

  assert.throws(() => {
    setStoreBatch(() => {
      setStore("batchPromiseGuard", { value: 1 });
      return Promise.resolve();
    });
  }, /promise-returning callbacks/);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(getStore("batchPromiseGuard"), { value: 1 });
  assert.deepStrictEqual(seen, [1]);
});

test("setStoreBatch flushes queued notifications before rethrowing callback errors", async () => {
  clearAllStores();
  createStore("batchThrowFlush", { value: 0 });
  const seen: number[] = [];

  _subscribe("batchThrowFlush", (value) => {
    if (!value) return;
    seen.push((value as { value: number }).value);
  });

  assert.throws(() => {
    setStoreBatch(() => {
      setStore("batchThrowFlush", { value: 1 });
      throw new Error("boom");
    });
  }, /boom/);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(getStore("batchThrowFlush"), { value: 1 });
  assert.deepStrictEqual(seen, [1]);
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

test("setStore merges fields without removing old ones", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", { role: "admin" });
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

test("deleteStore blocks subscriber writes while deletion is in progress", () => {
  clearAllStores();
  createStore("deleteRace", { name: "Alex" });
  _subscribe("deleteRace", (value) => {
    if (value !== null) return;
    setStore("deleteRace", { name: "Jordan" });
  });

  assert.doesNotThrow(() => {
    deleteStore("deleteRace");
  });
  assert.strictEqual(hasStore("deleteRace"), false);
});

test("deleteStore clears orphaned history entries", () => {
  clearAllStores();
  createStore("user", { name: "Alex" });
  setStore("user", { name: "Jordan" });

  assert.ok(getHistory("user").length > 0);
  deleteStore("user");
  assert.deepStrictEqual(getHistory("user"), []);
});

test("_getSnapshot returns immutable cached snapshots and clears cache entries on delete", () => {
  clearAllStores();
  createStore("snapshotCacheStore", { profile: { name: "Alex" } });

  const first = _getSnapshot("snapshotCacheStore") as any;
  const second = _getSnapshot("snapshotCacheStore") as any;

  assert.strictEqual(first, second);

  assert.throws(() => {
    first.profile.name = "Jordan";
  });

  const third = _getSnapshot("snapshotCacheStore") as any;
  assert.strictEqual(third.profile.name, "Alex");

  deleteStore("snapshotCacheStore");

  createStore("snapshotCacheStore", { profile: { name: "Recreated" } });
  const recreated = _getSnapshot("snapshotCacheStore") as any;
  assert.deepStrictEqual(recreated, { profile: { name: "Recreated" } });
  assert.notStrictEqual(recreated, first);
});

test("clearAllStores removes stores created during delete hooks", () => {
  clearAllStores();

  createStore("first", { value: 1 }, {
    onDelete: () => {
      if (!hasStore("late")) {
        createStore("late", { value: 2 }, { allowSSRGlobalStore: true });
      }
    },
  });

  clearAllStores();

  assert.strictEqual(hasStore("first"), false);
  assert.strictEqual(hasStore("late"), false);
  assert.deepStrictEqual(listStores(), []);
});

