/**
 * @fileoverview tests\options-adapter.test.ts
 */
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

test("normalizeStoreOptions defaults scope to request", () => {
  const normalized = normalizeStoreOptions({}, "requestScoped");

  assert.equal(normalized.scope, "request");
  assert.equal(normalized.allowSSRGlobalStore, false);
  assert.equal(normalized.historyLimit, 50);
  assert.equal(normalized.snapshot, "deep");
});

test("normalizeStoreOptions gives temp stores lighter defaults", () => {
  const normalized = normalizeStoreOptions({
    scope: "temp",
  }, "tempStore");

  assert.equal(normalized.scope, "temp");
  assert.equal(normalized.persist, null);
  assert.equal(normalized.sync, false);
  assert.equal(normalized.devtools, false);
  assert.equal(normalized.historyLimit, 0);
  assert.equal(normalized.redactor, undefined);
  assert.equal(normalized.snapshot, "deep");
});

test("normalizeStoreOptions preserves explicit temp store feature opt-ins", () => {
  const normalized = normalizeStoreOptions({
    scope: "temp",
    persist: true,
    sync: {
      channel: "temp-sync",
    },
    devtools: {
      enabled: true,
      historyLimit: 12,
    },
    snapshot: "shallow",
  }, "tempStore");

  assert.equal(normalized.scope, "temp");
  assert.ok(normalized.persist);
  assert.deepEqual(normalized.sync, {
    channel: "temp-sync",
  });
  assert.equal(normalized.devtools, true);
  assert.equal(normalized.historyLimit, 12);
  assert.equal(normalized.snapshot, "shallow");
});

test("normalizeStoreOptions supports persist checksum opt-out", () => {
  const normalized = normalizeStoreOptions({
    persist: {
      checksum: "none",
    },
  }, "persistNoChecksum");

  assert.equal(normalized.persist?.checksum, "none");
});

