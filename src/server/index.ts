/**
 * @module server
 *
 * LAYER: SSR
 * OWNS:  Module-level behavior and exports for server.
 *
 * Consumers: Internal imports and public API.
 */
import { hydrateStores } from "../core/store-write.js";
import { deepClone, produceClone } from "../utils.js";
import type { StoreOptions } from "../adapters/options.js";
import type { StoreStateMap } from "../core/store-lifecycle/types.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { injectWriteContextRunner, type WriteContext } from "../internals/write-context.js";
import {
    createStoreRegistry,
    injectCarrierRunner,
    injectRegistryRunner,
    type CarrierContext,
    type StoreRegistry,
    type TransactionState,
} from "../core/store-registry.js";
import { injectTransactionRunner } from "../core/store-transaction.js";

const serverAsyncContext = new AsyncLocalStorage<CarrierContext>();
const serverRegistryContext = new AsyncLocalStorage<ReturnType<typeof createStoreRegistry>>();
const serverTransactionContext = new AsyncLocalStorage<TransactionState>();
const serverWriteContext = new AsyncLocalStorage<WriteContext>();

injectCarrierRunner({
    run: (carrier, fn) => serverAsyncContext.run(carrier, fn),
    get: () => serverAsyncContext.getStore() || null,
});

injectRegistryRunner({
    run: (registry, fn) => serverRegistryContext.run(registry, fn),
    get: () => serverRegistryContext.getStore() || null,
    enterWith: (registry) => serverRegistryContext.enterWith(registry),
});

injectTransactionRunner({
    run: (state, fn) => serverTransactionContext.run(state, fn),
    get: () => serverTransactionContext.getStore() || null,
    enterWith: (state) => serverTransactionContext.enterWith(state),
});

injectWriteContextRunner({
    run: (context, fn) => serverWriteContext.run(context, fn),
    get: () => serverWriteContext.getStore() || null,
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
type RequestHydrateOptionsInternal = Record<string, StoreOptions<any> | undefined> & {
    default?: StoreOptions<any>;
};

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
    registry: StoreRegistry;
    snapshot: () => RequestSnapshot<StateMap>;
    hydrate: <T>(renderFn: () => T, options?: RequestHydrateOptions<StateMap>) => T;
};

export const createStoreForRequest = <StateMap extends StoreStateMap = StoreStateMap>(
    initializer?: (api: RequestStoreApi<StateMap>) => void
): RequestStoreContext<StateMap> => {
    const registry = createStoreRegistry("request");
    const buffer: RequestSnapshot<StateMap> = {};
    const bufferedOptions: Record<string, StoreOptions<any>> = {};
    const hasBuffered = (name: RequestStoreName<StateMap>): boolean =>
        Object.prototype.hasOwnProperty.call(buffer, name);
    const api: RequestStoreApi<StateMap> = {
        create: (name, data, options = {}) => {
            buffer[name] = deepClone(data) as RequestStoreValue<StateMap, typeof name>;
            bufferedOptions[name] = { ...options } as StoreOptions<any>;
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
        registry,
        snapshot: () => deepClone(buffer) as RequestSnapshot<StateMap>,
        hydrate: <T>(
            renderFn: () => T,
            options: RequestHydrateOptions<StateMap> = {}
        ): T => {
            const merged: RequestHydrateOptionsInternal = {
                ...(options as RequestHydrateOptionsInternal),
                default: (options as RequestHydrateOptionsInternal).default,
            };

            Object.keys(buffer).forEach((name) => {
                const key = name as RequestStoreName<StateMap>;
                const mergedOptions: StoreOptions<any> = {
                    ...(options.default as StoreOptions<any> | undefined || {}),
                    ...(options[key] as StoreOptions<any> | undefined || {}),
                    ...(bufferedOptions[name] || {}),
                };
                merged[key] = mergedOptions;
            });

            return serverRegistryContext.run(registry, () =>
                serverAsyncContext.run(deepClone(buffer), () => {
                    hydrateStores(
                        buffer,
                        merged as Parameters<typeof hydrateStores>[1],
                        { allowTrusted: true }
                    );
                    return renderFn();
                })
            );
        },
    };
};

export type { StoreRegistry } from "../core/store-registry.js";
