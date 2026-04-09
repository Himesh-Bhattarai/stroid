/**
 * @module tests/regression/persist-window-events.test
 *
 * LAYER: Tests
 * OWNS:  Regression coverage for persist setup with partial/strict window event mocks.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { installPersist } from "../../src/persist.js";
import { clearAllStores, createStore } from "../../src/store.js";

installPersist();

type Listener = (event?: unknown) => void;
type GlobalTestEnv = typeof globalThis & { window?: unknown };

test("persist setup tolerates unsupported unload events and still watches storage presence", async () => {
  clearAllStores();
  const events: Array<{ name: string; key: string; reason: string }> = [];
  const persisted = new Map<string, string>();
  const listeners = {
    storage: new Set<Listener>(),
    focus: new Set<Listener>(),
  };
  const g = globalThis as GlobalTestEnv;
  const originalWindow = g.window;

  g.window = {
    addEventListener: (type: string, handler: Listener) => {
      if (type === "storage" || type === "focus") {
        listeners[type].add(handler);
        return;
      }
      // Regression guard: persist should gracefully ignore unsupported lifecycle events.
      throw new Error(`unsupported-event:${type}`);
    },
    removeEventListener: (type: string, handler: Listener) => {
      if (type === "storage" || type === "focus") {
        listeners[type].delete(handler);
      }
    },
  };

  try {
    createStore("persist.window.regression", { theme: "dark" }, {
      persist: {
        key: "persist.window.regression.key",
        driver: {
          getItem: (key: string) => persisted.get(key) ?? null,
          setItem: (key: string, value: string) => {
            persisted.set(key, value);
          },
          removeItem: (key: string) => {
            persisted.delete(key);
          },
        },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        onStorageCleared: (info) => events.push(info),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    persisted.delete("persist.window.regression.key");
    listeners.focus.forEach((handler) => handler());

    assert.deepStrictEqual(events, [{
      name: "persist.window.regression",
      key: "persist.window.regression.key",
      reason: "missing",
    }]);
  } finally {
    clearAllStores();
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      g.window = originalWindow;
    }
  }
});

