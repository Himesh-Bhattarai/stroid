/**
 * @module tests/store-ops.test
 *
 * LAYER: Tests
 * OWNS:  Internal facade surface assertions for store-ops.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
    createStore as createFromOps,
    replaceStore as replaceFromOps,
    setStore as setFromOps,
    setStoreWithContext as setWithContextFromOps,
    getStore as getFromOps,
    hasStore as hasFromOps,
    subscribeStore as subscribeFromOps,
} from "../../src/internals/store-ops.js";
import { createStore as createDirect } from "../../src/core/store-create.js";
import { replaceStore as replaceDirect } from "../../src/core/store-replace.js";
import { setStore as setDirect, setStoreWithContext as setWithContextDirect } from "../../src/core/store-set.js";
import { getStore as getDirect, hasStore as hasDirect } from "../../src/core/store-read.js";
import { subscribeStore as subscribeDirect } from "../../src/core/store-notify.js";

test("store-ops re-exports internal store primitives", () => {
    assert.strictEqual(createFromOps, createDirect);
    assert.strictEqual(replaceFromOps, replaceDirect);
    assert.strictEqual(setFromOps, setDirect);
    assert.strictEqual(setWithContextFromOps, setWithContextDirect);
    assert.strictEqual(getFromOps, getDirect);
    assert.strictEqual(hasFromOps, hasDirect);
    assert.strictEqual(subscribeFromOps, subscribeDirect);
});
