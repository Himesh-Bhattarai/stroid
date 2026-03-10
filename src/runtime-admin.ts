import { createStoreAdmin } from "./internals/store-admin.js";
import { resetAsyncState } from "./async-cache.js";
import { pathValidationCache } from "./store-lifecycle.js";

const admin = createStoreAdmin(new URL("./store.js", import.meta.url).href);

export const clearAllStores = (): void => {
    admin.clearAllStores();
    resetAsyncState();
    pathValidationCache.clear();
};

export const clearStores = (pattern?: string): void => {
    admin.clearStores(pattern);
    pathValidationCache.clear();
};
