/**
 * @module server
 *
 * LAYER: SSR
 * OWNS:  Module-level behavior and exports for server.
 *
 * Consumers: Internal imports and public API.
 */
import { hydrateStores } from "../core/store-write.js";
import { deepClone } from "../utils.js";
import type { StoreOptions } from "../adapters/options.js";
import type { StoreStateMap } from "../core/store-lifecycle/types.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { getConfig } from "../internals/config.js";
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
import {
    captureRequestScopeFromRegistry,
    cloneRequestScopeCapture,
    createBufferedRequestStoreApi,
    type RequestHydrateOptions,
    type RequestScopeCapture,
    type RequestScopeOptions,
    type RequestScopeOptionsInternal,
    type RequestSnapshot,
    type RequestStoreApi,
} from "./shared.js";

const serverAsyncContext = new AsyncLocalStorage<CarrierContext>();
const serverRegistryContext = new AsyncLocalStorage<ReturnType<typeof createStoreRegistry>>();
const serverTransactionContext = new AsyncLocalStorage<TransactionState>();
const serverWriteContext = new AsyncLocalStorage<WriteContext>();
const memoizedCarrierByRegistry = new WeakMap<StoreRegistry, CarrierContext>();

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
    value !== null
    && (typeof value === "object" || typeof value === "function")
    && typeof (value as { then?: unknown }).then === "function";

const withCarrierMemo = <T>(
    registry: StoreRegistry | null,
    carrier: CarrierContext,
    run: () => T
): T => {
    if (!registry) return run();

    const hadPrevious = memoizedCarrierByRegistry.has(registry);
    const previousCarrier = memoizedCarrierByRegistry.get(registry);
    memoizedCarrierByRegistry.set(registry, carrier);

    const restore = (): void => {
        if (hadPrevious && previousCarrier) {
            memoizedCarrierByRegistry.set(registry, previousCarrier);
            return;
        }
        memoizedCarrierByRegistry.delete(registry);
    };

    try {
        const result = run();
        if (isPromiseLike(result)) {
            return Promise.resolve(result).finally(restore) as T;
        }
        restore();
        return result;
    } catch (error) {
        restore();
        throw error;
    }
};

injectCarrierRunner({
    run: (carrier, fn) => withCarrierMemo(
        serverRegistryContext.getStore(),
        carrier,
        () => serverAsyncContext.run(carrier, fn),
    ),
    get: () => {
        const registry = serverRegistryContext.getStore();
        if (registry) {
            const memoized = memoizedCarrierByRegistry.get(registry);
            if (memoized) return memoized;
        }
        return serverAsyncContext.getStore() || null;
    },
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
type RequestHydrateOptionsInternal = RequestScopeOptionsInternal & {
    default?: StoreOptions<unknown>;
};

const clearCarrierBuffer = (carrier: CarrierContext): void => {
    Object.keys(carrier).forEach((name) => {
        delete carrier[name];
    });
};

const scheduleCarrierCleanup = (registry: StoreRegistry, carrier: CarrierContext): void => {
    const delayMs = getConfig().flush.chunkDelayMs;
    const schedule = (fn: () => void): void => {
        if (delayMs > 0 && typeof setTimeout === "function") {
            setTimeout(fn, delayMs);
            return;
        }
        if (typeof queueMicrotask === "function") {
            queueMicrotask(fn);
            return;
        }
        Promise.resolve().then(fn);
    };

    const attempt = (): void => {
        const state = registry.notify;
        if (!state.isFlushing && !state.notifyScheduled && state.pendingNotifications.size === 0) {
            clearCarrierBuffer(carrier);
            return;
        }
        schedule(attempt);
    };

    // Defer the first attempt so already-queued flush microtasks can run first.
    schedule(attempt);
};

type RequestStoreContext<StateMap extends StoreStateMap> = {
    registry: StoreRegistry;
    snapshot: () => RequestSnapshot<StateMap>;
    capture: () => RequestScopeCapture<StateMap>;
    hydrate: <T>(renderFn: () => T, options?: RequestHydrateOptions<StateMap>) => T;
};

export const createStoreForRequest = <StateMap extends StoreStateMap = StoreStateMap>(
    initializer?: (api: RequestStoreApi<StateMap>) => void
): RequestStoreContext<StateMap> => {
    const registry = createStoreRegistry("request");
    const buffer: RequestSnapshot<StateMap> = {};
    const bufferedOptions: RequestScopeOptionsInternal = Object.create(null);
    const syncCapture = (capture: RequestScopeCapture<StateMap>): void => {
        Object.keys(buffer).forEach((name) => {
            delete buffer[name as RequestStoreName<StateMap>];
        });
        Object.keys(bufferedOptions).forEach((name) => {
            delete bufferedOptions[name];
        });

        Object.entries(capture.snapshot).forEach(([name, value]) => {
            buffer[name as RequestStoreName<StateMap>] = deepClone(value) as RequestStoreValue<
                StateMap,
                RequestStoreName<StateMap>
            >;
        });
        Object.entries(capture.options as RequestScopeOptionsInternal).forEach(([name, options]) => {
            if (options !== undefined) {
                bufferedOptions[name] = options;
            }
        });
    };
    const syncBufferFromCarrier = (carrier: CarrierContext): void => {
        syncCapture(captureRequestScopeFromRegistry<StateMap>(registry, carrier));
    };
    const api: RequestStoreApi<StateMap> = createBufferedRequestStoreApi<StateMap>({
        buffer,
        bufferedOptions,
    });
    if (typeof initializer === "function") initializer(api);
    return {
        registry,
        snapshot: () => cloneRequestScopeCapture({
            snapshot: buffer,
            options: bufferedOptions as RequestScopeOptions<StateMap>,
        }).snapshot,
        capture: () => {
            const carrier = serverAsyncContext.getStore();
            if (carrier) {
                return captureRequestScopeFromRegistry<StateMap>(registry, carrier);
            }
            return cloneRequestScopeCapture({
                snapshot: buffer,
                options: bufferedOptions as RequestScopeOptions<StateMap>,
            });
        },
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
                const mergedOptions: StoreOptions<unknown> = {
                    ...(options.default as StoreOptions<unknown> | undefined || {}),
                    ...(options[key] as StoreOptions<unknown> | undefined || {}),
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
                    const carrier = serverAsyncContext.getStore();
                    if (!carrier) return renderFn();

                    try {
                        const rendered = renderFn();
                        if (isPromiseLike(rendered)) {
                            return Promise.resolve(rendered).finally(() => {
                                syncBufferFromCarrier(carrier);
                                scheduleCarrierCleanup(registry, carrier);
                            }) as T;
                        }
                        syncBufferFromCarrier(carrier);
                        scheduleCarrierCleanup(registry, carrier);
                        return rendered;
                    } catch (err) {
                        syncBufferFromCarrier(carrier);
                        scheduleCarrierCleanup(registry, carrier);
                        throw err;
                    }
                })
            );
        },
    };
};

export type { StoreRegistry } from "../core/store-registry.js";
export type {
    RequestHydrateOptions,
    RequestScopeCapture,
    RequestScopeOptions,
    RequestSnapshot,
    RequestStoreApi,
    RequestStoreName,
    RequestStoreValue,
} from "./shared.js";
