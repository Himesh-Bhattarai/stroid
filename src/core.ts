/**
 * @module core
 *
 * LAYER: Public API (minimal runtime)
 * OWNS:  Core store primitives only.
 *
 * Consumers: Bundle-size-sensitive consumers and explicit core usage.
 */
// Minimal runtime surface for 'stroid/core'.
export { createStore, setStore, deleteStore } from "./store-write.js";
export { getStore } from "./store-read.js";
// Keep type exports for StoreStateMap augmentation without adding runtime weight.
export type {
    Path,
    PathValue,
    PartialDeep,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    StoreStateMap,
    StrictStoreMap,
    WriteResult,
} from "./store-lifecycle/types.js";


