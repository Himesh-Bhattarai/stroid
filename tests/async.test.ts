import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enableRevalidateOnFocus, fetchStore, getAsyncMetrics, refetchStore } from "../src/async.js";
import { configureStroid, resetConfig } from "../src/config.js";
import { getStore, clearAllStores, deleteStore, createStore } from "../src/store.js";

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const ensureAsyncStore = (name: string) => {
  createStore(name, {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });
};

test("fetchStore stateAdapter writes into a custom store shape", async () => {
  clearAllStores();
  createStore("customAsync", { items: [] as number[], loading: false, error: null });

  const result = await fetchStore("customAsync", Promise.resolve([1, 2]), {
    stateAdapter: ({ next, set }) => {
      set((draft: any) => {
        draft.loading = next.loading;
        draft.error = next.error;
        if (next.status === "success" && next.data) {
          draft.items = next.data as number[];
        }
      });
    },
  });

  assert.deepStrictEqual(result, [1, 2]);
  const state = getStore("customAsync");
  assert.deepStrictEqual(state, { items: [1, 2], loading: false, error: null });
  assert.strictEqual((state as any)?.status, undefined);
});

test("fetchStore warns when overwriting a non-async store without stateAdapter", async () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  try {
    createStore("profile", { name: "Alex" });
    const result = await fetchStore("profile", Promise.resolve({ name: "Jordan" }), { dedupe: false });
    assert.strictEqual(result, null);
  } finally {
    resetConfig();
  }

  assert.ok(warnings.some((msg) => msg.includes("non-async store")));
  const state = getStore("profile") as any;
  assert.deepStrictEqual(state, { name: "Alex" });
});

test("fetchStore warns once when async results are mutable", async () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
    asyncCloneResult: "none",
  });

  const controller = new AbortController();
  try {
    ensureAsyncStore("mutableAsync");
    await fetchStore("mutableAsync", Promise.resolve({ value: 1 }), { signal: controller.signal, dedupe: false });
    await fetchStore("mutableAsync", Promise.resolve({ value: 2 }), { signal: controller.signal, dedupe: false });
  } finally {
    resetConfig();
  }

  const mutableWarnings = warnings.filter((msg) => msg.includes("asyncCloneResult"));
  assert.strictEqual(mutableWarnings.length, 1);
});

test("fetchStore dedupes inflight requests", async () => {
  clearAllStores();
  ensureAsyncStore("dedupeStore");
  const realFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    await wait(10);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ value: "deduped" }),
      text: async () => JSON.stringify({ value: "deduped" }),
    } as any;
  }) as typeof fetch;

  try {
    const p1 = fetchStore("dedupeStore", "https://api.example.com/value");
    const p2 = fetchStore("dedupeStore", "https://api.example.com/value");
    const [r1, r2] = await Promise.all([p1, p2]);

    assert.strictEqual(callCount, 1);
    const state = getStore("dedupeStore");
    assert.deepStrictEqual(state?.data, { value: "deduped" });
    assert.deepStrictEqual(r1, r2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore uses last-write-wins for racing promises", async () => {
  clearAllStores();
  ensureAsyncStore("raceStore");

  const slow = new Promise((res) => setTimeout(() => res({ result: "slow" }), 30));
  const fast = new Promise((res) => setTimeout(() => res({ result: "fast" }), 5));

  await Promise.all([
    fetchStore("raceStore", slow, { dedupe: false }),
    fetchStore("raceStore", fast, { dedupe: false }),
  ]);

  const state = getStore("raceStore");
  assert.deepStrictEqual(state?.data, { result: "fast" });
  assert.strictEqual(state?.status, "success");
});

test("fetchStore keeps the latest concurrent result when earlier requests settle first", async () => {
  clearAllStores();
  ensureAsyncStore("raceStoreOrdered");
  const first = deferred<{ result: string }>();
  const second = deferred<{ result: string }>();

  const firstRequest = fetchStore("raceStoreOrdered", first.promise, { dedupe: false });
  await wait(0);
  const secondRequest = fetchStore("raceStoreOrdered", second.promise, { dedupe: false });

  first.resolve({ result: "first" });
  await wait(0);
  second.resolve({ result: "second" });

  const [r1, r2] = await Promise.all([firstRequest, secondRequest]);

  assert.strictEqual(r1, null);
  assert.deepStrictEqual(r2, { result: "second" });
  const state = getStore("raceStoreOrdered");
  assert.deepStrictEqual(state?.data, { result: "second" });
  assert.strictEqual(state?.status, "success");
});

test("fetchStore aborts lifecycle-owned requests when the store is deleted", async () => {
  clearAllStores();
  ensureAsyncStore("lifecycledStore");
  const realFetch = globalThis.fetch;
  let aborted = false;
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    seenSignal = init?.signal as AbortSignal | undefined;
    return new Promise((resolve, reject) => {
      seenSignal?.addEventListener("abort", () => {
        aborted = true;
        const err = new Error("aborted") as Error & { name: string };
        err.name = "AbortError";
        reject(err);
      });

      setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: () => "application/json" },
          json: async () => ({ value: "late" }),
          text: async () => JSON.stringify({ value: "late" }),
        } as any);
      }, 50);
    });
  }) as typeof fetch;

  try {
    const request = fetchStore("lifecycledStore", "https://api.example.com/slow");
    await wait(0);
    deleteStore("lifecycledStore");

    const result = await request;
    assert.strictEqual(result, null);
    assert.ok(seenSignal);
    assert.strictEqual(aborted, true);
  } finally {
    globalThis.fetch = realFetch;
    clearAllStores();
  }
});

test("fetchStore times out when no AbortSignal is provided", async () => {
  clearAllStores();
  ensureAsyncStore("timeoutStore");
  const realSetTimeout = globalThis.setTimeout;
  let scheduledMs: number | null = null;

  globalThis.setTimeout = ((handler: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    scheduledMs = typeof ms === "number" ? ms : 0;
    return realSetTimeout(handler, 0, ...args) as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  const pending = new Promise<unknown>(() => {});

  try {
    const result = await Promise.race([
      fetchStore("timeoutStore", pending, { dedupe: false }),
      new Promise<"timeout">((resolve) => realSetTimeout(() => resolve("timeout"), 50)),
    ]);

    assert.notStrictEqual(result, "timeout");
    assert.strictEqual(result, null);
    const state = getStore("timeoutStore");
    assert.strictEqual(state?.status, "error");
    assert.ok(state?.error?.includes("Timeout: async request hung for 60 seconds"));
    assert.strictEqual(scheduledMs, 60000);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    clearAllStores();
  }
});

test("fetchStore keeps success state when onSuccess throws", async () => {
  clearAllStores();
  ensureAsyncStore("callbackSuccessStore");

  const result = await fetchStore("callbackSuccessStore", Promise.resolve({ value: "ok" }), {
    dedupe: false,
    onSuccess: () => {
      throw new Error("success hook boom");
    },
  });

  assert.deepStrictEqual(result, { value: "ok" });
  const state = getStore("callbackSuccessStore");
  assert.deepStrictEqual(state?.data, { value: "ok" });
  assert.strictEqual(state?.status, "success");
});

test("fetchStore swallows onError callback throws and returns null", async () => {
  clearAllStores();
  ensureAsyncStore("callbackErrorStore");

  const result = await fetchStore("callbackErrorStore", Promise.reject(new Error("network boom")), {
    dedupe: false,
    onError: () => {
      throw new Error("error hook boom");
    },
  });

  assert.strictEqual(result, null);
  const state = getStore("callbackErrorStore");
  assert.strictEqual(state?.status, "error");
  assert.strictEqual(state?.error, "network boom");
});

test("fetchStore bails out cleanly when production SSR store creation is blocked", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const asyncPath = path.join(repoRoot, "src", "async.ts");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const { fetchStore } = await import(pathToFileURL(${JSON.stringify(asyncPath)}).href);
    const { getStore, hasStore } = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    let fetchCalls = 0;
    const errors = [];
    const reported = [];
    const originalConsoleError = console.error;
    console.error = (message) => {
      reported.push(String(message ?? ""));
    };
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ value: "late" }),
        text: async () => JSON.stringify({ value: "late" }),
      };
    };

    try {
      const result = await fetchStore("ssrAsync", "https://api.example.com/value", {
        onError: (msg) => { errors.push(msg); },
      });
      assert.strictEqual(result, null);
      assert.strictEqual(hasStore("ssrAsync"), false);
      assert.strictEqual(getStore("ssrAsync"), null);
      assert.strictEqual(fetchCalls, 0);
      assert.ok(errors.some((msg) => msg.includes('fetchStore("ssrAsync") cannot create a backing store on the server in production')));
      assert.ok(reported.some((msg) => msg.includes('fetchStore("ssrAsync") cannot create a backing store on the server in production')));
    } finally {
      console.error = originalConsoleError;
    }
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

test("fetchStore stops retrying after abort during backoff", async () => {
  clearAllStores();
  ensureAsyncStore("retryAbortStore");
  const realFetch = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  const started = Date.now();

  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("retry me");
  }) as typeof fetch;

  try {
    const request = fetchStore("retryAbortStore", "https://api.example.com/retry", {
      retry: 2,
      retryDelay: 50,
      signal: controller.signal,
    });

    await wait(10);
    controller.abort();
    const result = await request;
    const elapsed = Date.now() - started;

    assert.strictEqual(result, null);
    assert.strictEqual(calls, 1);
    assert.ok(elapsed < 45, `expected abort-aware delay to settle promptly, got ${elapsed}ms`);
    const state = getStore("retryAbortStore");
    assert.strictEqual(state?.status, "aborted");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore clamps unbounded retry storms to a finite policy", async () => {
  clearAllStores();
  ensureAsyncStore("retryStormStore");
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("storm");
  }) as typeof fetch;

  try {
    const result = await fetchStore("retryStormStore", "https://api.example.com/storm", {
      retry: Number.POSITIVE_INFINITY,
      retryDelay: 0,
      retryBackoff: 1,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(calls, 11);
    const state = getStore("retryStormStore");
    assert.strictEqual(state?.status, "error");
    assert.strictEqual(state?.error, "storm");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore evicts old cache slots under high-cardinality cacheKey usage", async () => {
  clearAllStores();
  ensureAsyncStore("searchCacheStore");
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ call: calls }),
      text: async () => JSON.stringify({ call: calls }),
    } as any;
  }) as typeof fetch;

  try {
    for (let i = 0; i <= 100; i++) {
      await fetchStore("searchCacheStore", "https://api.example.com/search", {
        cacheKey: `k${i}`,
        ttl: 60_000,
        dedupe: false,
      });
    }

    await fetchStore("searchCacheStore", "https://api.example.com/search", {
      cacheKey: "k0",
      ttl: 60_000,
      dedupe: false,
    });

    assert.strictEqual(calls, 102);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore ignores retry delays for direct Promise inputs", async () => {
  clearAllStores();
  ensureAsyncStore("promiseRetryStore");
  const started = Date.now();

  const result = await fetchStore("promiseRetryStore", Promise.reject(new Error("promise boom")), {
    retry: 3,
    retryDelay: 50,
  });

  const elapsed = Date.now() - started;
  assert.strictEqual(result, null);
  assert.ok(elapsed < 80, `expected Promise input to fail without retry delay, got ${elapsed}ms`);
  const state = getStore("promiseRetryStore");
  assert.strictEqual(state?.status, "error");
  assert.strictEqual(state?.error, "promise boom");
});

test("fetchStore ignores a direct Promise result that resolves after abort", async () => {
  clearAllStores();
  ensureAsyncStore("promiseAbortStore");
  const controller = new AbortController();
  const pending = deferred<{ value: string }>();

  const request = fetchStore("promiseAbortStore", pending.promise, {
    dedupe: false,
    signal: controller.signal,
  });

  controller.abort();
  pending.resolve({ value: "late" });

  const result = await request;

  assert.strictEqual(result, null);
  const state = getStore("promiseAbortStore");
  assert.strictEqual(state?.status, "aborted");
  assert.strictEqual(state?.data, null);
});

test("stale abort settlement does not overwrite a newer async success", async () => {
  clearAllStores();
  ensureAsyncStore("abortRaceStore");
  const first = deferred<{ value: string }>();
  const second = deferred<{ value: string }>();
  const controller = new AbortController();

  const firstRequest = fetchStore("abortRaceStore", first.promise, {
    dedupe: false,
    signal: controller.signal,
  });
  await wait(0);
  const secondRequest = fetchStore("abortRaceStore", second.promise, {
    dedupe: false,
  });

  second.resolve({ value: "fresh" });
  await secondRequest;
  controller.abort();
  first.resolve({ value: "stale" });

  const firstResult = await firstRequest;

  assert.strictEqual(firstResult, null);
  const state = getStore("abortRaceStore");
  assert.deepStrictEqual(state?.data, { value: "fresh" });
  assert.strictEqual(state?.status, "success");
});

test("fetchStore rejects deduped callers that use different transforms for one cache slot", async () => {
  clearAllStores();
  ensureAsyncStore("dedupeTransformStore");
  const realFetch = globalThis.fetch;
  const errors: string[] = [];

  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => ({ value: 1 }),
    text: async () => JSON.stringify({ value: 1 }),
  })) as typeof fetch;

  try {
    const first = fetchStore("dedupeTransformStore", "https://api.example.com/value", {
      transform: (value: any) => ({ value: value.value + 1 }),
    });
    const second = await fetchStore("dedupeTransformStore", "https://api.example.com/value", {
      transform: (value: any) => ({ value: value.value + 2 }),
      onError: (msg) => { errors.push(msg); },
    });

    const firstResult = await first;

    assert.strictEqual(second, null);
    assert.deepStrictEqual(firstResult, { value: 2 });
    assert.ok(errors.some((msg) => msg.includes('cannot dedupe callers that use different transform functions')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore exposes background revalidation while serving cached data", async () => {
  clearAllStores();
  ensureAsyncStore("swrStore");
  const realFetch = globalThis.fetch;
  const refresh = deferred<{ value: string }>();
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ value: "cached" }),
        text: async () => JSON.stringify({ value: "cached" }),
      } as any;
    }
    const result = await refresh.promise;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => result,
      text: async () => JSON.stringify(result),
    } as any;
  }) as typeof fetch;

  try {
    await fetchStore("swrStore", "https://api.example.com/swr", { ttl: 5_000 });

    const request = fetchStore("swrStore", "https://api.example.com/swr", {
      ttl: 5_000,
      staleWhileRevalidate: true,
    });

    const during = getStore("swrStore") as any;
    assert.deepStrictEqual(during.data, { value: "cached" });
    assert.strictEqual(during.status, "success");
    assert.strictEqual(during.loading, true);
    assert.strictEqual(during.cached, true);
    assert.strictEqual(during.revalidating, true);

    refresh.resolve({ value: "fresh" });
    await request;

    const after = getStore("swrStore") as any;
    assert.deepStrictEqual(after.data, { value: "fresh" });
    assert.strictEqual(after.loading, false);
    assert.strictEqual(after.cached, false);
    assert.strictEqual(after.revalidating, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore preserves stale data when background revalidation fails", async () => {
  clearAllStores();
  ensureAsyncStore("swrFailStore");
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ value: "cached" }),
        text: async () => JSON.stringify({ value: "cached" }),
      } as any;
    }
    throw new Error("refresh failed");
  }) as typeof fetch;

  try {
    await fetchStore("swrFailStore", "https://api.example.com/swr-fail", { ttl: 5_000 });
    const result = await fetchStore("swrFailStore", "https://api.example.com/swr-fail", {
      ttl: 5_000,
      staleWhileRevalidate: true,
      dedupe: false,
    });

    assert.strictEqual(result, null);
    const state = getStore("swrFailStore") as any;
    assert.deepStrictEqual(state.data, { value: "cached" });
    assert.strictEqual(state.error, "refresh failed");
    assert.strictEqual(state.status, "error");
    assert.strictEqual(state.cached, true);
    assert.strictEqual(state.revalidating, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore caps per-store inflight request slots under unique cache keys", async () => {
  clearAllStores();
  ensureAsyncStore("burstStore");
  const realFetch = globalThis.fetch;
  const pending: Array<ReturnType<typeof deferred<{ slot: number }>>> = [];
  const errors: string[] = [];
  let calls = 0;

  globalThis.fetch = (() => {
    calls += 1;
    const next = deferred<{ slot: number }>();
    pending.push(next);
    return next.promise.then((value) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => value,
      text: async () => JSON.stringify(value),
    })) as any;
  }) as typeof fetch;

  try {
    const requests = Array.from({ length: 100 }, (_, i) =>
      fetchStore("burstStore", "https://api.example.com/burst", {
        dedupe: false,
        cacheKey: `slot-${i}`,
      })
    );

    await wait(0);

    const overflow = await fetchStore("burstStore", "https://api.example.com/burst", {
      dedupe: false,
      cacheKey: "slot-overflow",
      onError: (msg) => { errors.push(msg); },
    });
    assert.strictEqual(overflow, null);
    assert.strictEqual(calls, 100);
    assert.ok(errors.some((msg) => msg.includes('fetchStore("burstStore") exceeded 100 concurrent request slots')));

    pending.forEach((entry, index) => {
      entry.resolve({ slot: index });
    });
    await Promise.all(requests);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refetchStore returns undefined when no previous fetch exists", async () => {
  clearAllStores();

  const result = await refetchStore("missingAsyncHistory");

  assert.strictEqual(result, undefined);
});

test("getAsyncMetrics tracks request, cache, dedupe, and failure counters", async () => {
  clearAllStores();
  ensureAsyncStore("metricsStore");
  ensureAsyncStore("metricsDedupeStore");
  ensureAsyncStore("metricsFailStore");
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 3) {
      throw new Error("metrics boom");
    }
    await wait(5);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ call: calls }),
      text: async () => JSON.stringify({ call: calls }),
    } as any;
  }) as typeof fetch;

  const before = getAsyncMetrics();

  try {
    await fetchStore("metricsStore", "https://api.example.com/metrics", {
      ttl: 5_000,
      dedupe: false,
    });
    await fetchStore("metricsStore", "https://api.example.com/metrics", {
      ttl: 5_000,
      dedupe: false,
    });

    const p1 = fetchStore("metricsDedupeStore", "https://api.example.com/dedupe");
    const p2 = fetchStore("metricsDedupeStore", "https://api.example.com/dedupe");
    await Promise.all([p1, p2]);

    await fetchStore("metricsFailStore", "https://api.example.com/fail", {
      dedupe: false,
    });

    const after = getAsyncMetrics();
    assert.ok(calls >= 3);
    assert.ok(after.requests - before.requests >= 3);
    assert.strictEqual(after.cacheHits - before.cacheHits, 1);
    assert.ok(after.cacheMisses - before.cacheMisses >= 3);
    assert.strictEqual(after.dedupes - before.dedupes, 1);
    assert.strictEqual(after.failures - before.failures, 1);
    assert.ok(after.lastMs >= 0);
    assert.ok(after.avgMs >= 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("enableRevalidateOnFocus wildcard cleanup removes focus and online listeners", async () => {
  clearAllStores();
  ensureAsyncStore("focusStore");
  const realWindow = (globalThis as any).window;
  const realFetch = globalThis.fetch;
  const listeners = new Map<string, Set<() => void>>();
  let calls = 0;

  (globalThis as any).window = {
    addEventListener: (event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeEventListener: (event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler);
    },
  };

  globalThis.fetch = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ value: calls }),
      text: async () => JSON.stringify({ value: calls }),
    } as any;
  }) as typeof fetch;

  try {
    await fetchStore("focusStore", "https://api.example.com/focus", { dedupe: false });
    const cleanup = enableRevalidateOnFocus();

    assert.strictEqual(listeners.get("focus")?.size, 1);
    assert.strictEqual(listeners.get("online")?.size, 1);

    listeners.get("focus")?.forEach((handler) => handler());
    await wait(0);
    assert.strictEqual(calls, 2);

    cleanup();

    assert.strictEqual(listeners.get("focus")?.size ?? 0, 0);
    assert.strictEqual(listeners.get("online")?.size ?? 0, 0);

    listeners.get("focus")?.forEach((handler) => handler());
    await wait(0);
    assert.strictEqual(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
    if (realWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = realWindow;
    }
  }
});

test("fetchStore caps no-signal warning cache size under high-cardinality stores", async () => {
  clearAllStores();
  configureStroid({
    logSink: {
      log: () => {},
      warn: () => {},
      critical: () => {},
    },
  });
  const { noSignalWarned, MAX_WARNED_ENTRIES } = await import("../src/async-cache.js");

  try {
    for (let i = 0; i < MAX_WARNED_ENTRIES + 25; i += 1) {
      await fetchStore(`warnStore${i}`, Promise.resolve(i), { dedupe: false });
    }

    assert.ok(noSignalWarned.size <= MAX_WARNED_ENTRIES);
  } finally {
    resetConfig();
    clearAllStores();
  }
});
