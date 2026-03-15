/**
 * @module runtime-admin
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for runtime-admin.
 *
 * Consumers: Internal imports and public API.
 */
import { resetAsyncState } from "./async-cache.js";
import { getStoreAdmin } from "./store-lifecycle/registry.js";
import { clearPathValidationCache } from "./store-lifecycle/validation.js";

export const clearAllStores = (): void => {
    getStoreAdmin().clearAllStores();
    resetAsyncState();
    clearPathValidationCache();
};

export const clearStores = (pattern?: string): void => {
    getStoreAdmin().clearStores(pattern);
    clearPathValidationCache();
};


