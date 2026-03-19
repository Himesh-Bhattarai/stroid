/**
 * @module store-core
 *
 * LAYER: Store core
 * OWNS:  Minimal core adapters and registry accessors.
 *
 * Consumers: Internal async modules.
 */
import type { StoreRegistry } from "./store-registry.js";
import { getActiveStoreRegistry } from "./store-registry.js";
import { getStore } from "./store-read.js";
import { setStore } from "./store-write.js";
import { subscribeStore } from "./store-notify.js";
import type { IStoreCore } from "./store-shared/core.js";
import type { StoreName } from "./store-lifecycle/types.js";

export const getActiveRegistry = (): StoreRegistry => getActiveStoreRegistry();

export const getActiveAsyncRegistry = (): StoreRegistry["async"] =>
    getActiveStoreRegistry().async;

export const createStoreCore = <T = any>(name: string): IStoreCore<T> => {
    const storeName = name as StoreName;
    return {
        get: (path?: string) =>
            (path ? (getStore(storeName, path as any) as T | null) : (getStore(storeName) as T | null)),
        set: (path: string, value: any) => {
            (setStore as any)(storeName, path, value);
        },
        subscribe: (cb: (val: T | null) => void) => subscribeStore(storeName, cb as any),
    };
};
