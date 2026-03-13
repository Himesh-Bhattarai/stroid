import test from "node:test";
import assert from "node:assert";
import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { fetchStore } from "../src/async.js";
import { asyncMetrics } from "../src/async-cache.js";
import { useAsyncStore, useAsyncStoreSuspense, useFormStore, useSelector, useStore, useStoreField, useStoreStatic } from "../src/hooks.js";
import { clearAllStores, createStore, setStore } from "../src/store.js";
import { resetAllStoresForTest } from "../src/testing.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
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
    renderer.unmount();
  });
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
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
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
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
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
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
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
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
    renderer.unmount();
  });
});

test("useAsyncStoreSuspense does not reissue fetches when options are omitted", async () => {
  resetAllStoresForTest();
  asyncMetrics.dedupes = 0;
  createStore("suspenseStore", { data: null, loading: false, error: null });

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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Root));
  });

  const dedupesBefore = asyncMetrics.dedupes;

  await act(async () => {
    bump?.();
  });

  assert.strictEqual(asyncMetrics.dedupes, dedupesBefore);

  await act(async () => {
    resolvePromise(123);
    await fetchPromise;
  });

  await act(async () => {
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
  });

  await act(async () => {
    setStore("staticStore", "value", 2);
  });

  assert.strictEqual(renderCount, 1);
  assert.deepStrictEqual(seen, [1]);

  await act(async () => {
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(App));
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
      renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
  });

  assert.deepStrictEqual(seen, [{
    zero: false,
    flag: false,
    text: false,
  }]);

  await act(async () => {
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
  });

  await act(async () => {
    latestOnChange("Jordan");
  });

  await act(async () => {
    latestOnChange({ target: { value: "Taylor" } });
  });

  assert.deepStrictEqual(seen, ["Alex", "Jordan", "Taylor"]);
  assert.strictEqual(useStoreStatic("formStore", "profile.name"), "Taylor");

  await act(async () => {
    renderer.unmount();
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

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(App));
  });

  await act(async () => {
    latestOnChange({ target: { type: "checkbox", checked: true, value: "on" } });
  });

  assert.strictEqual(useStoreStatic("checkboxFormStore", "accepted"), true);

  await act(async () => {
    renderer.unmount();
  });
});
