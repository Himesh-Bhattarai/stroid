import test from "node:test";
import assert from "node:assert/strict";
import {
  collectLegacyOptionDeprecationWarnings,
  normalizeStoreOptions,
  resetLegacyOptionDeprecationWarningsForTests,
} from "../src/adapters/options.js";

test("legacy flat options emit one deprecation warning per legacy key", () => {
  resetLegacyOptionDeprecationWarningsForTests();

  const warnings = collectLegacyOptionDeprecationWarnings({
    allowSSRGlobalStore: true,
    validator: (next) => Boolean(next),
    version: 2,
    historyLimit: 25,
    middleware: [],
  });

  assert.deepEqual(warnings, [
    'createStore option "allowSSRGlobalStore" is deprecated. Use "scope: "global"" instead.',
    'createStore option "validator" is deprecated. Use "validate" instead.',
    'createStore option "version" is deprecated. Use "persist.version" instead.',
    'createStore option "historyLimit" is deprecated. Use "devtools.historyLimit" instead.',
    'createStore option "middleware" is deprecated. Use "lifecycle.middleware" instead.',
  ]);

  assert.deepEqual(
    collectLegacyOptionDeprecationWarnings({
      allowSSRGlobalStore: true,
      validator: (next) => Boolean(next),
      version: 2,
      historyLimit: 25,
      middleware: [],
    }),
    []
  );
});

test("grouped options do not emit legacy deprecation warnings", () => {
  resetLegacyOptionDeprecationWarningsForTests();

  const warnings = collectLegacyOptionDeprecationWarnings({
    scope: "global",
    validate: (next) => Boolean(next),
    persist: {
      version: 2,
      migrations: {
        2: (state) => state,
      },
    },
    devtools: {
      historyLimit: 25,
      redactor: (state) => state,
    },
    lifecycle: {
      middleware: [],
      onSet: () => undefined,
    },
  });

  assert.deepEqual(warnings, []);
});

test("normalizeStoreOptions preserves grouped sync options and global scope opt-in", () => {
  const conflictResolver = ({ incoming }: { incoming: unknown }) => incoming;

  const normalized = normalizeStoreOptions({
    scope: "global",
    sync: {
      channel: "shared-room",
      maxPayloadBytes: 321,
      conflictResolver,
    },
  }, "sharedStore");

  assert.equal(normalized.allowSSRGlobalStore, true);
  assert.deepEqual(normalized.sync, {
    channel: "shared-room",
    maxPayloadBytes: 321,
    conflictResolver,
  });
});
