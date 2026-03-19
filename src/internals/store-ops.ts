/**
 * @module internals/store-ops
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/store-ops.
 *
 * Consumers: Internal imports and public API.
 */
// Internal facade for store operations used by higher-level modules (like computed).
// Intentional internal boundary: update this shim (and its test) when owners move.
export { createStore } from "../core/store-create.js";
export { replaceStore } from "../core/store-replace.js";
export { setStore, setStoreWithContext } from "../core/store-set.js";
export { getStore, hasStore } from "../core/store-read.js";
export { subscribeStore } from "../core/store-notify.js";


