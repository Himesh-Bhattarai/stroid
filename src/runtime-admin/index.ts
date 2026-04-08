/**
 * @module runtime-admin
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for runtime-admin.
 *
 * Consumers: Internal imports and public API.
 */
import { resetAsyncState } from "../async/cache.js";
import { getStoreAdmin } from "../core/store-lifecycle/registry.js";
import { clearPathValidationCache } from "../core/store-lifecycle/validation.js";
import { clearAllStores as clearAllStoresGuarded } from "../core/store-admin.js";
import { isTransactionActive } from "../core/store-transaction.js";

export const clearAllStores = (): void => {
    if (isTransactionActive()) {
        clearAllStoresGuarded();
        return;
    }
    clearAllStoresGuarded();
    resetAsyncState();
    clearPathValidationCache();
};

export const clearStores = (pattern?: string): void => {
    getStoreAdmin().clearStores(pattern);
    clearPathValidationCache();
};


