/**
 * @module async
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async.
 *
 * Consumers: Internal imports and public API.
 */
export type { FetchOptions, FetchInput, AsyncStateSnapshot, AsyncStateAdapter } from "./async-cache.js";
export {
    fetchStore,
    refetchStore,
    enableRevalidateOnFocus,
    getAsyncMetrics,
    _resetAsyncStateForTests,
} from "./async-fetch.js";


