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
export { createStore, replaceStore, setStore } from "../store-write.js";
export { getStore, hasStore } from "../store-read.js";
export { subscribeStore } from "../store-notify.js";


