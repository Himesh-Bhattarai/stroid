/**
 * @module tests/regression/snapshot-safety
 *
 * LAYER: Tests
 * OWNS:  Snapshot safety policies (warn/throw/auto-clone) for ref/shallow modes.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  clearAllStores,
  createStore,
  setStore,
  subscribeStore,
  getStore,
} from "../../src/store.js";
import { configureStroid } from "../../src/config.js";

const tick = async () => new Promise((resolve) => setTimeout(resolve, 0));

test("snapshotSafety=warn logs mutation warnings for ref snapshots", async () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  createStore("warnStore", { count: 0 }, { snapshot: "ref", snapshotSafety: "warn" });
  const off = subscribeStore("warnStore", (snap: any) => {
    snap.count = 1;
  });

  setStore("warnStore", { count: 1 });
  await tick();
  off();

  assert.ok(
    warnings.some((msg) => msg.includes("Snapshot mutation detected")),
    "expected a snapshot mutation warning"
  );
});

test("snapshotSafety=auto-clone delivers cloned snapshot without corrupting store", async () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  createStore("cloneStore", { count: 0 }, { snapshot: "ref", snapshotSafety: "auto-clone" });
  let seen: number | null = null;
  const offA = subscribeStore("cloneStore", (snap: any) => {
    snap.count = 99;
  });
  const offB = subscribeStore("cloneStore", (snap: any) => {
    seen = snap.count;
  });

  setStore("cloneStore", { count: 1 });
  await tick();
  offA();
  offB();

  assert.strictEqual(getStore("cloneStore")?.count, 1);
  assert.strictEqual(seen, 1);
  assert.ok(
    warnings.some((msg) => msg.includes("Delivered a cloned snapshot")),
    "expected auto-clone warning"
  );
});

test("snapshotSafety=throw surfaces mutation errors", async () => {
  clearAllStores();
  createStore("throwStore", { count: 0 }, { snapshot: "ref", snapshotSafety: "throw" });
  subscribeStore("throwStore", (snap: any) => {
    snap.count = 2;
  });

  const err = await new Promise<Error>((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.setUncaughtExceptionCaptureCallback(null);
      reject(new Error("Expected mutation error was not captured"));
    }, 1000);

    const handler = (error: Error) => {
      clearTimeout(timeout);
      process.setUncaughtExceptionCaptureCallback(null);
      resolve(error);
    };

    if (typeof process.setUncaughtExceptionCaptureCallback === "function") {
      process.setUncaughtExceptionCaptureCallback(handler);
    } else {
      const legacyHandler = (error: Error) => {
        process.off("uncaughtException", legacyHandler);
        handler(error);
      };
      process.once("uncaughtException", legacyHandler);
    }

    setStore("throwStore", { count: 1 });
  });

  await tick();

  assert.ok(/read only|readonly|cannot assign|cannot add property/i.test(err.message));
});
