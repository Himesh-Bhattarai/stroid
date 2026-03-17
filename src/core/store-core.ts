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

export const getActiveRegistry = (): StoreRegistry => getActiveStoreRegistry();

export const getActiveAsyncRegistry = (): StoreRegistry["async"] =>
    getActiveStoreRegistry().async;

export const createStoreCore = <T = any>(name: string): IStoreCore<T> => ({
    get: (path?: string) =>
        (path ? (getStore(name, path) as T | null) : (getStore(name) as T | null)),
    set: (path: string, value: any) => {
        setStore(name, path as any, value);
    },
    subscribe: (cb: (val: T | null) => void) => subscribeStore(name, cb as any),
});
