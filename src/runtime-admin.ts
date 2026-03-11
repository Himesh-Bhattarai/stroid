import { resetAsyncState } from "./async-cache.js";
import { pathValidationCache, storeAdmin } from "./store-lifecycle.js";

export const clearAllStores = (): void => {
    storeAdmin.clearAllStores();
    resetAsyncState();
    pathValidationCache.clear();
};

export const clearStores = (pattern?: string): void => {
    storeAdmin.clearStores(pattern);
    pathValidationCache.clear();
};
