/**
 * @module internals/store-ops
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/store-ops.
 *
 * Consumers: Internal imports and public API.
 */
// Internal facade for store operations used by higher-level modules (like computed).
// Keeps dependencies explicit and contained without changing public APIs.
export { createStore, replaceStore, setStore, setStoreWithContext } from "../core/store-write.js";
export { getStore, hasStore } from "../core/store-read.js";
export { subscribeStore } from "../core/store-notify.js";


