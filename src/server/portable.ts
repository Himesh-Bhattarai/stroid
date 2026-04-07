/**
 * @module server/portable
 *
 * LAYER: SSR
 * OWNS:  Explicit request-scope helpers for runtimes without implicit async-local propagation.
 *
 * Consumers: Server Actions, worker-style runtimes, and serverless boundary hand-off flows.
 */
import { createStore } from "../core/store-create.js";
import { getStore } from "../core/store-read.js";
import { setStore } from "../core/store-set.js";
import { hydrateStores } from "../core/store-write.js";
import { createStoreRegistry, runWithRegistry, type StoreRegistry } from "../core/store-registry.js";
import type { StoreStateMap } from "../core/store-lifecycle/types.js";
import {
    captureRequestScopeFromRegistry,
    cloneRequestScopeCapture,
    cloneRequestStoreOptions,
    type RequestScopeCapture,
    type RequestSnapshot,
    type RequestStoreName,
    type RequestStoreValue,
} from "./shared.js";
import type { StoreOptions } from "../adapters/options.js";

const createStoreUntyped = createStore as (
    name: string,
    initialData: unknown,
    options?: StoreOptions<unknown>
) => unknown;
const getStoreUntyped = getStore as (name: string) => unknown;
const setStoreUntyped = setStore as (name: string, update: unknown) => unknown;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
    value !== null
    && (typeof value === "object" || typeof value === "function")
    && typeof (value as { then?: unknown }).then === "function";

export type RequestScopeApi<StateMap extends StoreStateMap = StoreStateMap> = {
    create: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        data: RequestStoreValue<StateMap, Name>,
        options?: StoreOptions<RequestStoreValue<StateMap, Name>>
    ) => RequestStoreValue<StateMap, Name> | null;
    set: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        updater: RequestStoreValue<StateMap, Name> | ((draft: RequestStoreValue<StateMap, Name>) => void)
    ) => RequestStoreValue<StateMap, Name> | null;
    get: <Name extends RequestStoreName<StateMap>>(
        name: Name
    ) => RequestStoreValue<StateMap, Name> | null;
    snapshot: () => RequestSnapshot<StateMap>;
    capture: () => RequestScopeCapture<StateMap>;
    bind: <Args extends unknown[], Result>(
        callback: (...args: Args) => Result
    ) => (...args: Args) => Result;
};

export type RequestScopeContext<StateMap extends StoreStateMap = StoreStateMap> =
    RequestScopeApi<StateMap> & {
        registry: StoreRegistry;
        run: <T>(fn: (api: RequestScopeApi<StateMap>) => T) => T;
    };

export const createRequestScope = <StateMap extends StoreStateMap = StoreStateMap>(
    initial?: RequestScopeCapture<StateMap>
): RequestScopeContext<StateMap> => {
    const registry = createStoreRegistry("request");
    let activeRunDepth = 0;

    if (initial) {
        const seeded = cloneRequestScopeCapture(initial);
        runWithRegistry(registry, () => {
            hydrateStores(
                seeded.snapshot,
                seeded.options as Parameters<typeof hydrateStores>[1],
                { allowTrusted: true },
            );
        });
    }

    const capture = (): RequestScopeCapture<StateMap> =>
        cloneRequestScopeCapture(captureRequestScopeFromRegistry<StateMap>(registry));

    const api: RequestScopeApi<StateMap> = {
        create: (name, data, options = {}) =>
            runWithRegistry(registry, () => {
                createStoreUntyped(
                    name as string,
                    data,
                    cloneRequestStoreOptions(options) as StoreOptions<unknown> | undefined
                );
                return getStoreUntyped(name as string) as RequestStoreValue<StateMap, typeof name> | null;
            }),
        set: (name, updater) =>
            runWithRegistry(registry, () => {
                setStoreUntyped(name as string, updater);
                return getStoreUntyped(name as string) as RequestStoreValue<StateMap, typeof name> | null;
            }),
        get: (name) =>
            runWithRegistry(registry, () =>
                getStoreUntyped(name as string) as RequestStoreValue<StateMap, typeof name> | null
            ),
        snapshot: () => capture().snapshot,
        capture,
        bind: <Args extends unknown[], Result>(
            callback: (...args: Args) => Result
        ): ((...args: Args) => Result) =>
            (...args: Args): Result =>
                activeRunDepth > 0
                    ? runWithRegistry(registry, () => callback(...args))
                    : callback(...args),
    };

    return {
        registry,
        ...api,
        run: <T>(fn: (scope: RequestScopeApi<StateMap>) => T): T => {
            activeRunDepth += 1;
            let result: T;
            try {
                result = runWithRegistry(registry, () => fn(api));
            } catch (error) {
                activeRunDepth -= 1;
                throw error;
            }
            if (isPromiseLike(result)) {
                return Promise.resolve(result).finally(() => {
                    activeRunDepth -= 1;
                }) as T;
            }
            activeRunDepth -= 1;
            return result;
        },
    };
};

export type {
    RequestHydrateOptions,
    RequestScopeCapture,
    RequestScopeOptions,
    RequestSnapshot,
    RequestStoreName,
    RequestStoreValue,
} from "./shared.js";
