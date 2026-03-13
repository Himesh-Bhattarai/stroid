import { resetAsyncState } from "./async-cache.js";
import { clearPathValidationCache, getStoreAdmin } from "./store-lifecycle.js";

export const clearAllStores = (): void => {
    getStoreAdmin().clearAllStores();
    resetAsyncState();
    clearPathValidationCache();
};

export const clearStores = (pattern?: string): void => {
    getStoreAdmin().clearStores(pattern);
    clearPathValidationCache();
};
