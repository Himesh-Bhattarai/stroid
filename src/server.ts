/**
 * @fileoverview src\server.ts
 */
import { hydrateStores } from "./store.js";
import { deepClone, produceClone } from "./utils.js";
import type { StoreOptions } from "./store.js";
import type { StoreStateMap } from "./store-lifecycle/types.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { createStoreRegistry, injectCarrierRunner, injectRegistryRunner, type CarrierContext } from "./store-registry.js";

const serverAsyncContext = new AsyncLocalStorage<CarrierContext>();
const serverRegistryContext = new AsyncLocalStorage<ReturnType<typeof createStoreRegistry>>();

injectCarrierRunner({
    run: (carrier, fn) => serverAsyncContext.run(carrier, fn),
    get: () => serverAsyncContext.getStore() || null,
});

injectRegistryRunner({
    run: (registry, fn) => serverRegistryContext.run(registry, fn),
    get: () => serverRegistryContext.getStore() || null,
    enterWith: (registry) => serverRegistryContext.enterWith(registry),
});

type RequestStoreName<StateMap> =
    keyof StateMap extends never ? string : keyof StateMap & string;
type RequestStoreValue<StateMap, Name extends RequestStoreName<StateMap>> =
    Name extends keyof StateMap ? StateMap[Name] : unknown;
type RequestSnapshot<StateMap> = Partial<{
    [K in RequestStoreName<StateMap>]: RequestStoreValue<StateMap, K>;
}>;
type RequestHydrateOptions<StateMap> = Partial<{
    [K in RequestStoreName<StateMap>]: StoreOptions<RequestStoreValue<StateMap, K>>;
}> & { default?: StoreOptions };

export type RequestStoreApi<StateMap extends StoreStateMap = StoreStateMap> = {
    create: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        data: RequestStoreValue<StateMap, Name>,
        options?: StoreOptions<RequestStoreValue<StateMap, Name>>
    ) => RequestStoreValue<StateMap, Name>;
    set: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        updater: RequestStoreValue<StateMap, Name> | ((draft: RequestStoreValue<StateMap, Name>) => void)
    ) => RequestStoreValue<StateMap, Name>;
    get: <Name extends RequestStoreName<StateMap>>(
        name: Name
    ) => RequestStoreValue<StateMap, Name> | undefined;
};

type RequestStoreContext<StateMap extends StoreStateMap> = {
    snapshot: () => RequestSnapshot<StateMap>;
    hydrate: <T>(renderFn: () => T, options?: RequestHydrateOptions<StateMap>) => T;
};

export const createStoreForRequest = <StateMap extends StoreStateMap = StoreStateMap>(
    initializer?: (api: RequestStoreApi<StateMap>) => void
): RequestStoreContext<StateMap> => {
    const registry = createStoreRegistry();
    const buffer: RequestSnapshot<StateMap> = {};
    const bufferedOptions: Record<string, StoreOptions<unknown>> = {};
    const hasBuffered = (name: RequestStoreName<StateMap>): boolean =>
        Object.prototype.hasOwnProperty.call(buffer, name);
    const api: RequestStoreApi<StateMap> = {
        create: (name, data, options = {}) => {
            buffer[name] = deepClone(data) as RequestStoreValue<StateMap, typeof name>;
            bufferedOptions[name] = { ...options };
            return buffer[name] as RequestStoreValue<StateMap, typeof name>;
        },
        set: (name, updater) => {
            if (!hasBuffered(name)) {
                throw new Error(`createStoreForRequest.set("${name}") requires create("${name}", initialState) first.`);
            }
            buffer[name] = typeof updater === "function"
                ? produceClone(
                    buffer[name] as RequestStoreValue<StateMap, typeof name>,
                    updater as (draft: RequestStoreValue<StateMap, typeof name>) => void
                )
                : updater;
            return buffer[name] as RequestStoreValue<StateMap, typeof name>;
        },
        get: (name) => (hasBuffered(name)
            ? deepClone(buffer[name]) as RequestStoreValue<StateMap, typeof name>
            : undefined),
    };
    if (typeof initializer === "function") initializer(api);
    return {
        snapshot: () => deepClone(buffer) as RequestSnapshot<StateMap>,
        hydrate: <T>(
            renderFn: () => T,
            options: RequestHydrateOptions<StateMap> = {}
        ): T => {
            const merged: RequestHydrateOptions<StateMap> = {
                ...options,
                default: options.default,
            };

            Object.keys(buffer).forEach((name) => {
                const key = name as RequestStoreName<StateMap>;
                merged[key] = {
                    ...(options.default || {}),
                    ...(options[key] || {}),
                    ...(bufferedOptions[name] || {}),
                };
            });

            return serverRegistryContext.run(registry, () =>
                serverAsyncContext.run(deepClone(buffer), () => {
                    hydrateStores(buffer, merged, { allowUntrusted: true });
                    return renderFn();
                })
            );
        },
    };
};

