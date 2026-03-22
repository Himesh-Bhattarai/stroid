/**
 * @module tests/react-hooks.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/react-hooks.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import React from "react";
import { act, render } from "@testing-library/react";
import { fetchStore } from "../../src/async.js";
import { getAsyncMetrics } from "../../src/async/cache.js";
import { RegistryScope, useAsyncStore, useAsyncStoreSuspense, useFormStore, useSelector, useStore, useStoreField, useStoreStatic } from "../../src/react/index.js";
import { clearAllStores, createStore, getStore, setStore } from "../../src/store.js";
import { createStoreRegistry, runWithRegistry } from "../../src/core/store-registry.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { configureStroid, resetConfig } from "../../src/config.js";

test("useStore inline primitive selector stays stable through unrelated updates", async () => {
  clearAllStores();
  createStore("reactUser", {
    profile: { name: "Alex" },
    other: 0,
  });

  let renderCount = 0;
  const seen: Array<string | null> = [];

  const App = () => {
    renderCount += 1;
    if (renderCount > 10) {
      throw new Error("useStore inline primitive selector entered a render loop");
    }
    const name = useStore<any, string>("reactUser", (state) => state.profile.name);
    seen.push(name);
    return React.createElement("span", null, name);
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, ["Alex"]);

  await act(async () => {
    setStore("reactUser", "other", 1);
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, ["Alex"]);

  await act(async () => {
    setStore("reactUser", "profile.name", "Jordan");
  });

  assert.strictEqual(renderCount, 2);
  assert.deepStrictEqual(seen, ["Alex", "Jordan"]);

  await act(async () => {
    unmount();
  });
});

test("RegistryScope isolates store access between React trees", async () => {
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();

  runWithRegistry(registryA, () => {
    createStore("scopedUser", { name: "A" });
  });
  runWithRegistry(registryB, () => {
    createStore("scopedUser", { name: "B" });
  });

  const App = ({ label }: { label: string }) => {
    const name = useStore<any, string>("scopedUser", "name");
    return React.createElement("span", { "data-testid": label }, name ?? "");
  };

  const Root = () => React.createElement(
    React.Fragment,
    null,
    React.createElement(
      RegistryScope,
      { value: registryA },
      React.createElement(App, { label: "a" })
    ),
    React.createElement(
      RegistryScope,
      { value: registryB },
      React.createElement(App, { label: "b" })
    )
  );

  let unmount!: () => void;
  let getByTestId!: (id: string) => HTMLElement;
  await act(async () => {
    ({ unmount, getByTestId } = render(React.createElement(Root)));
  });

  assert.strictEqual(getByTestId("a").textContent, "A");
  assert.strictEqual(getByTestId("b").textContent, "B");

  await act(async () => {
    runWithRegistry(registryA, () => {
      setStore("scopedUser", "name", "A2");
    });
  });

  assert.strictEqual(getByTestId("a").textContent, "A2");
  assert.strictEqual(getByTestId("b").textContent, "B");

  await act(async () => {
    unmount();
  });
});

test("useStore warns once for loose store names and respects acknowledgeLooseTypes", async () => {
  resetAllStoresForTest();
  const warnings: string[] = [];

  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  createStore("looseWarn", { value: 1 });
  createStore("looseWarn2", { value: 2 });

  const App = ({ name }: { name: string }) => {
    const value = useStore<number>(name, "value");
    return React.createElement("span", null, String(value ?? ""));
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App, { name: "looseWarn" })));
  });

  await act(async () => {
    unmount();
  });

  await act(async () => {
    ({ unmount } = render(React.createElement(App, { name: "looseWarn2" })));
  });

  await act(async () => {
    unmount();
  });

  const untypedWarnings = warnings.filter((msg) => msg.includes("store name is untyped"));
  assert.strictEqual(untypedWarnings.length, 1);

  warnings.length = 0;
  resetConfig();
  configureStroid({
    acknowledgeLooseTypes: true,
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  await act(async () => {
    ({ unmount } = render(React.createElement(App, { name: "looseWarn" })));
  });

  await act(async () => {
    unmount();
  });

  const acknowledged = warnings.filter((msg) => msg.includes("store name is untyped"));
  assert.strictEqual(acknowledged.length, 0);

  resetConfig();
});

test("useStore warns once for broad subscriptions without a selector", async () => {
  resetAllStoresForTest();
  const warnings: string[] = [];

  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  createStore("broadWarn", { value: 1 });

  const App = () => {
    const state = useStore<any>("broadWarn");
    return React.createElement("span", null, String(state?.value ?? ""));
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });
  await act(async () => {
    unmount();
  });

  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });
  await act(async () => {
    unmount();
  });

  const broadWarnings = warnings.filter((msg) => msg.includes("without a selector/path"));
  assert.strictEqual(broadWarnings.length, 1);

  resetConfig();
});

test("selector recreation warnings describe selector churn without claiming repeated subscriptions", async () => {
  resetAllStoresForTest();
  const warnings: string[] = [];

  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  createStore("selectorWarnStore", {
    profile: { name: "Alex" },
  });

  const App = ({ tick }: { tick: number }) => {
    const nameFromUseStore = useStore<any, string>("selectorWarnStore", (state) => state.profile.name);
    const nameFromUseSelector = useSelector<any, string>("selectorWarnStore", (state) => state.profile.name, Object.is);
    return React.createElement("span", null, `${tick}:${nameFromUseStore ?? ""}:${nameFromUseSelector ?? ""}`);
  };

  let rerender!: (ui: React.ReactElement) => void;
  let unmount!: () => void;
  await act(async () => {
    ({ rerender, unmount } = render(React.createElement(App, { tick: 0 })));
  });

  await act(async () => {
    rerender(React.createElement(App, { tick: 1 }));
  });

  const selectorWarnings = warnings.filter((msg) =>
    msg.includes('selector was recreated between renders')
  );

  assert.ok(selectorWarnings.some((msg) => msg.includes("selector cache reuse")));
  assert.ok(selectorWarnings.some((msg) => msg.includes("selector churn")));
  assert.ok(selectorWarnings.every((msg) => !msg.includes("repeated subscriptions")));
  assert.ok(selectorWarnings.every((msg) => !msg.includes("resubscribe churn")));

  await act(async () => {
    unmount();
  });

  resetConfig();
});

test("useStore inline object selector with custom equality does not loop or rerender on unrelated writes", async () => {
  clearAllStores();
  createStore("reactPrefs", {
    profile: { name: "Alex" },
    other: 0,
  });

  let renderCount = 0;
  const seen: string[] = [];

  const App = () => {
    renderCount += 1;
    if (renderCount > 10) {
      throw new Error("useStore inline object selector entered a render loop");
    }
    const selected = useStore<any, { name: string }>(
      "reactPrefs",
      (state) => ({ name: state.profile.name }),
      (a, b) => a?.name === b?.name
    );
    seen.push(selected?.name ?? "null");
    return React.createElement("span", null, selected?.name ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, ["Alex"]);

  await act(async () => {
    setStore("reactPrefs", "other", 1);
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, ["Alex"]);

  await act(async () => {
    setStore("reactPrefs", "profile.name", "Jordan");
  });

  assert.strictEqual(renderCount, 2);
  assert.deepStrictEqual(seen, ["Alex", "Jordan"]);

  await act(async () => {
    unmount();
  });
});

test("useStoreField rerenders only when the selected field changes", async () => {
  clearAllStores();
  createStore("fieldStore", {
    profile: { name: "Alex" },
    other: 0,
  });

  let renderCount = 0;
  const seen: Array<string | null> = [];

  const App = () => {
    renderCount += 1;
    const name = useStoreField<string>("fieldStore", "profile.name");
    seen.push(name);
    return React.createElement("span", null, name ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  await act(async () => {
    setStore("fieldStore", "other", 1);
  });

  await act(async () => {
    setStore("fieldStore", "profile.name", "Jordan");
  });

  assert.strictEqual(renderCount, 2);
  assert.deepStrictEqual(seen, ["Alex", "Jordan"]);

  await act(async () => {
    unmount();
  });
});

test("useSelector applies default shallow equality to object selections", async () => {
  clearAllStores();
  createStore("selectorHookStore", {
    profile: { name: "Alex" },
    other: 0,
  });

  let renderCount = 0;
  const seen: string[] = [];

  const App = () => {
    renderCount += 1;
    const selected = useSelector<any, { name: string }>("selectorHookStore", (state) => ({
      name: state.profile.name,
    }));
    seen.push(selected?.name ?? "null");
    return React.createElement("span", null, selected?.name ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  await act(async () => {
    setStore("selectorHookStore", "other", 1);
  });

  await act(async () => {
    setStore("selectorHookStore", "profile.name", "Jordan");
  });

  assert.strictEqual(renderCount, 2);
  assert.deepStrictEqual(seen, ["Alex", "Jordan"]);

  await act(async () => {
    unmount();
  });
});

test("selector hooks can mount before createStore and update when the store appears", async () => {
  clearAllStores();
  const seenUseStore: Array<string | null> = [];
  const seenUseSelector: Array<string | null> = [];

  const App = () => {
    const nameFromUseStore = useStore<any, string>("lateHookStore", (state) => state.profile.name);
    const nameFromUseSelector = useSelector<any, string>("lateHookStore", (state) => state.profile.name, Object.is);
    seenUseStore.push(nameFromUseStore);
    seenUseSelector.push(nameFromUseSelector);
    return React.createElement("span", null, nameFromUseStore ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  assert.deepStrictEqual(seenUseStore, [null]);
  assert.deepStrictEqual(seenUseSelector, [null]);

  await act(async () => {
    createStore("lateHookStore", { profile: { name: "Alex" } });
  });

  await act(async () => {
    setStore("lateHookStore", "profile.name", "Jordan");
  });

  assert.deepStrictEqual(seenUseStore, [null, "Alex", "Jordan"]);
  assert.deepStrictEqual(seenUseSelector, [null, "Alex", "Jordan"]);

  await act(async () => {
    unmount();
  });
});

test("useAsyncStoreSuspense does not reissue fetches when options are omitted", async () => {
  resetAllStoresForTest();
  const metrics = getAsyncMetrics();
  metrics.dedupes = 0;
  createStore("suspenseStore", { data: null, loading: false, error: null, status: "idle" });

  let resolvePromise!: (value: number) => void;
  const fetchPromise = new Promise<number>((resolve) => {
    resolvePromise = resolve;
  });
  const fetchFn = () => fetchPromise;

  let bump: (() => void) | null = null;

  const App = () => {
    const [tick, setTick] = React.useState(0);
    bump = () => setTick((t) => t + 1);
    const data = useAsyncStoreSuspense<number>("suspenseStore", fetchFn);
    return React.createElement("span", null, `${tick}:${String(data)}`);
  };

  const Root = () => React.createElement(
    React.Suspense,
    { fallback: React.createElement("span", null, "loading") },
    React.createElement(App)
  );

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(Root)));
  });

  const dedupesBefore = metrics.dedupes;

  await act(async () => {
    bump?.();
  });

  assert.strictEqual(metrics.dedupes, dedupesBefore);

  await act(async () => {
    resolvePromise(123);
    await fetchPromise;
  });

  await act(async () => {
    unmount();
  });
});

test("useStoreStatic returns a snapshot without subscribing to later updates", async () => {
  clearAllStores();
  createStore("staticStore", { value: 1 });

  let renderCount = 0;
  const seen: number[] = [];

  const App = () => {
    renderCount += 1;
    const value = useStoreStatic<number>("staticStore", "value");
    seen.push(value ?? -1);
    return React.createElement("span", null, String(value ?? ""));
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  await act(async () => {
    setStore("staticStore", "value", 2);
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, [1]);

  await act(async () => {
    unmount();
  });
});

test("useAsyncStore reflects fetchStore loading and success state", async () => {
  clearAllStores();
  createStore("asyncHookStore", {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });
  const realFetch = globalThis.fetch;
  let resolveFetch!: (value: unknown) => void;

  globalThis.fetch = (() => new Promise((resolve) => {
    resolveFetch = (value) => {
      resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => value,
        text: async () => JSON.stringify(value),
      } as any);
    };
  })) as typeof fetch;

  const seen: Array<{ status: string; loading: boolean; data: unknown; isEmpty: boolean }> = [];

  const App = () => {
    const asyncState = useAsyncStore("asyncHookStore");
    seen.push({
      status: asyncState.status,
      loading: asyncState.loading,
      data: asyncState.data,
      isEmpty: asyncState.isEmpty,
    });
    return React.createElement("span", null, asyncState.status);
  };

  let unmount!: () => void;
  try {
    await act(async () => {
      ({ unmount } = render(React.createElement(App)));
    });

    const request = fetchStore("asyncHookStore", "https://api.example.com/hook", {
      dedupe: false,
    });

    await act(async () => {
      await Promise.resolve();
    });

    resolveFetch({ value: "done" });
    await act(async () => {
      await request;
    });

    assert.deepStrictEqual(seen, [
      { status: "idle", loading: false, data: null, isEmpty: true },
      { status: "loading", loading: true, data: null, isEmpty: false },
      { status: "success", loading: false, data: { value: "done" }, isEmpty: false },
    ]);
  } finally {
    globalThis.fetch = realFetch;
    await act(async () => {
      unmount();
    });
  }
});

test("useAsyncStore isEmpty treats falsy successful payloads as non-empty", async () => {
  clearAllStores();

  createStore("asyncFalsyZero", {
    data: 0,
    loading: false,
    error: null,
    status: "success",
  });
  createStore("asyncFalsyFalse", {
    data: false,
    loading: false,
    error: null,
    status: "success",
  });
  createStore("asyncFalsyEmptyString", {
    data: "",
    loading: false,
    error: null,
    status: "success",
  });

  const seen: Array<{ zero: boolean; flag: boolean; text: boolean }> = [];

  const App = () => {
    const zero = useAsyncStore("asyncFalsyZero");
    const flag = useAsyncStore("asyncFalsyFalse");
    const text = useAsyncStore("asyncFalsyEmptyString");
    seen.push({
      zero: zero.isEmpty,
      flag: flag.isEmpty,
      text: text.isEmpty,
    });
    return React.createElement("span", null, "ready");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  assert.deepStrictEqual(seen, [{
    zero: false,
    flag: false,
    text: false,
  }]);

  await act(async () => {
    unmount();
  });
});

test("useFormStore updates store values from direct values and input events", async () => {
  clearAllStores();
  createStore("formStore", { profile: { name: "Alex" } });

  const seen: Array<string | null> = [];
  let latestOnChange!: (value: unknown) => void;

  const App = () => {
    const form = useFormStore<string>("formStore", "profile.name");
    latestOnChange = form.onChange;
    seen.push(form.value);
    return React.createElement("span", null, form.value ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  await act(async () => {
    latestOnChange("Jordan");
  });

  await act(async () => {
    latestOnChange({ target: { value: "Taylor" } });
  });

  assert.deepStrictEqual(seen, ["Alex", "Jordan", "Taylor"]);
  assert.strictEqual(getStore("formStore", "profile.name"), "Taylor");

  await act(async () => {
    unmount();
  });
});

test("useFormStore uses checked for checkbox inputs", async () => {
  clearAllStores();
  createStore("checkboxFormStore", { accepted: false });

  let latestOnChange!: (value: unknown) => void;

  const App = () => {
    const form = useFormStore<boolean>("checkboxFormStore", "accepted");
    latestOnChange = form.onChange;
    return React.createElement("span", null, String(form.value));
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  await act(async () => {
    latestOnChange({ target: { type: "checkbox", checked: true, value: "on" } });
  });

  assert.strictEqual(getStore("checkboxFormStore", "accepted"), true);

  await act(async () => {
    unmount();
  });
});


