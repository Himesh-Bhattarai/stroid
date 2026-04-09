/**
 * @module async-fetch
 *
 * LAYER: Module
 * OWNS:  Stable facade exports for async fetch runtime.
 *
 * Consumers: Internal imports and public API.
 */
import { resetAsyncState } from "./cache.js";
import { cleanupAllRevalidateHandlers } from "./fetch/revalidate.js";

export { fetchStore } from "./fetch/fetch-store.js";
export { enableRevalidateOnFocus, refetchStore, cleanupAllRevalidateHandlers } from "./fetch/revalidate.js";
export { getAsyncMetrics } from "./fetch/metrics.js";

export const _resetAsyncStateForTests = (): void => {
    cleanupAllRevalidateHandlers();
    resetAsyncState();
};
