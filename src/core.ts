/**
 * @module core
 *
 * LAYER: Public API (minimal runtime)
 * OWNS:  Core store primitives only.
 *
 * Consumers: Bundle-size-sensitive consumers and explicit core usage.
 */
// Minimal runtime surface for 'stroid/core'.
export { createStore, setStore, resetStore, deleteStore } from "./store-write.js";
export { getStore, hasStore } from "./store-read.js";


