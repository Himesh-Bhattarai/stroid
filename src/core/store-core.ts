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
import { store } from "./store-name.js";

export const getActiveRegistry = (): StoreRegistry => getActiveStoreRegistry();

export const getActiveAsyncRegistry = (): StoreRegistry["async"] =>
    getActiveStoreRegistry().async;

type StoreCoreState = Record<string, unknown>;

export const createStoreCore = <T = unknown>(name: string): IStoreCore<T> => {
    const storeName = name as StoreName;
    const handle = store<string, StoreCoreState>(storeName);
    return {
        get: (path?: string) =>
            (path
                ? (getStore(handle, path) as unknown as T | null)
                : (getStore(handle) as unknown as T | null)),
        set: (path: string, value: unknown) => {
            setStore(handle, path, value);
        },
        subscribe: (cb: (val: T | null) => void) =>
            subscribeStore(storeName, (val) => cb(val as unknown as T | null)),
    };
};
