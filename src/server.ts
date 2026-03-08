import { hydrateStores } from "./store.js";
import { deepClone, produceClone } from "./utils.js";
import type { StoreOptions } from "./store.js";

export const createStoreForRequest = (
    initializer?: (api: {
        create: (name: string, data: any, options?: StoreOptions) => any;
        set: (name: string, updater: any) => any;
        get: (name: string) => any;
    }) => void
) => {
    const buffer: Record<string, any> = {};
    const hasBuffered = (name: string): boolean => Object.prototype.hasOwnProperty.call(buffer, name);
    const api = {
        create: (name: string, data: any, _options: StoreOptions = {}) => {
            buffer[name] = deepClone(data);
            return buffer[name];
        },
        set: (name: string, updater: any) => {
            if (!hasBuffered(name)) {
                throw new Error(`createStoreForRequest.set("${name}") requires create("${name}", initialState) first.`);
            }
            buffer[name] = typeof updater === "function" ? produceClone(buffer[name], updater) : updater;
            return buffer[name];
        },
        get: (name: string) => (hasBuffered(name) ? deepClone(buffer[name]) : undefined),
    };
    if (typeof initializer === "function") initializer(api);
    return {
        snapshot: () => deepClone(buffer),
        hydrate: (options: Record<string, StoreOptions> & { default?: StoreOptions } = {}) => hydrateStores(buffer, options),
    };
};
