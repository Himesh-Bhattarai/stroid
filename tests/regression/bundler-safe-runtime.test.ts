/**
 * @module tests/regression/bundler-safe-runtime.test
 *
 * LAYER: Tests
 * OWNS:  Regression coverage for bundler-safe default registry scope behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

test("store-registry does not use import.meta.url for the default registry scope", () => {
  const file = path.resolve(process.cwd(), "src/core/store-registry.ts");
  const source = fs.readFileSync(file, "utf8");

  assert.ok(!source.includes("new URL(\"../../store.js\", import.meta.url)"));
  assert.ok(!source.includes("import.meta.url"));
  assert.ok(source.includes('normalizeStoreRegistryScope("stroid:default-registry")'));
});
