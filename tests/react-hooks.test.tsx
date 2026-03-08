import test from "node:test";
import assert from "node:assert";
import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { useStore } from "../src/hooks.js";
import { clearAllStores, createStore, setStore } from "../src/store.js";

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
