/**
 * @module async-fetch
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for async-fetch.
 *
 * Consumers: Internal imports and public API.
 */
import { createStore, setStoreWithContext, hasStore, getStore } from "./internals/store-ops.js";
import { error, warn, isDev } from "./utils.js";
import { getConfig } from "./internals/config.js";
import { nameOf } from "./store-lifecycle/identity.js";
import type { StoreDefinition, StoreKey, StoreName } from "./store-lifecycle/types.js";
import {
    getCacheMeta,
    countInflightSlots,
    getAsyncMetrics as getAsyncMetricsRegistry,
    getFetchRegistry,
    getRevalidateHandlers,
    getRevalidateKeys,
    getWildcardCleanups,
    MAX_INFLIGHT_SLOTS_PER_STORE,
    warnOnce,
    ensureCleanupSubscription,
    pruneAsyncCache,
    registerStoreCleanup,
    unregisterStoreCleanup,
    shouldUseCache,
    type FetchInput,
    type FetchOptions,
    type AsyncStateSnapshot,
} from "./async-cache.js";
import { resetAsyncState } from "./async-cache.js";
import { delay, normalizeRetryOptions, MAX_RETRY_DELAY_MS } from "./async-retry.js";
import { cloneAsyncResult } from "./async/clone.js";
import { reportAsyncUsageError, runAsyncHook } from "./async/errors.js";
import {
    clearInflightEntry,
    clearRequestVersion,
    hasInflightEntry,
    isCurrentRequest,
    reserveRequestVersion,
    setInflightEntry,
    tryDedupeRequest,
} from "./async/inflight.js";
import { RATE_MAX, RATE_WINDOW_MS, pruneRateCounters, registerRateHit, scheduleRatePrune } from "./async/rate.js";
import { buildFetchOptions, parseResponseBody } from "./async/request.js";
import { runWithWriteContext, type WriteContext } from "./internals/write-context.js";
type AsyncState = AsyncStateSnapshot;

const looksLikeAsyncState = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return ("data" in record) && ("loading" in record) && ("error" in record) && ("status" in record);
};

const _applyAsyncState = (
    name: string,
    storeHandle: StoreDefinition<string, AsyncState>,
    next: AsyncStateSnapshot,
    options: FetchOptions,
    context: WriteContext | null
): void => {
    if (!hasStore(name)) return;
    const stateAdapter = options.stateAdapter;
    if (stateAdapter) {
        try {
            const prev = getStore({ name } as StoreDefinition<string, unknown>);
            const set = (value: unknown | ((draft: any) => void)) => {
                setStoreWithContext(storeHandle as StoreDefinition<string, any>, value as any, undefined, context);
            };
            runWithWriteContext(context, () => {
                stateAdapter({
                    name,
                    prev,
                    next,
                    set,
                });
            });
        } catch (err) {
            warn(`fetchStore("${name}") stateAdapter failed: ${(err as { message?: string })?.message ?? err}`);
        }
        return;
    }
    runWithWriteContext(context, () => {
        setStoreWithContext(storeHandle, next as AsyncState, undefined, context);
    });
};

const _settleAbort = (
    name: string,
    cacheSlot: string,
    version: number,
    applyState: (next: AsyncStateSnapshot) => void
): null => {
    warn(`fetchStore("${name}") aborted`);
    if (isCurrentRequest(cacheSlot, version) && hasStore(name)) {
        applyState({
            loading: false,
            error: "aborted",
            status: "aborted",
            revalidating: false,
        });
    }
    return null;
};

export function fetchStore<Name extends string, State>(
    name: StoreDefinition<Name, State>,
    urlOrRequest: FetchInput,
    options?: FetchOptions
): Promise<unknown>;
export function fetchStore<Name extends string, State>(
    name: StoreKey<Name, State>,
    urlOrRequest: FetchInput,
    options?: FetchOptions
): Promise<unknown>;
export function fetchStore<Name extends StoreName>(
    name: Name,
    urlOrRequest: FetchInput,
    options?: FetchOptions
): Promise<unknown>;
export async function fetchStore(
    nameInput: string | StoreDefinition<string, unknown>,
    urlOrRequest: FetchInput,
    options: FetchOptions = {}
): Promise<unknown> {
    const name = nameOf(nameInput as StoreDefinition<string, unknown>);
    if (!name || typeof name !== "string") {
        error(`fetchStore requires a store name as first argument`);
        return;
    }
    const storeHandle = { name } as StoreDefinition<string, AsyncState>;

    if (!urlOrRequest) {
        error(`fetchStore("${name}") requires a URL, Promise, or Promise factory as second argument`);
        return;
    }

    const {
        transform,
        onSuccess,
        onError,
        stateAdapter,
        method,
        headers,
        body,
        ttl,
        staleWhileRevalidate = false,
        dedupe = true,
        retry = 0,
        retryDelay = 400,
        retryBackoff = 1.7,
        signal,
        cacheKey,
        responseType = "auto",
    } = options;
    const cacheMeta = getCacheMeta();
    const fetchRegistry = getFetchRegistry();
    const asyncMetrics = getAsyncMetricsRegistry();
    const baseContext: WriteContext | null = (() => {
        const explicit = options.correlationId;
        const trace = options.traceContext;
        if (explicit || trace) {
            return { correlationId: explicit, traceContext: trace };
        }
        if (getConfig().autoCorrelationIds) {
            return {
                correlationId: `stroid-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                traceContext: trace,
            };
        }
        return null;
    })();

    if (!signal && isDev()) {
        warnOnce("noSignal", name, () => {
            warn(
                `fetchStore("${name}") called without an AbortSignal. Provide "signal" to enable cancellation (recommended).`
            );
        });
    }

    const cacheSlot = cacheKey ? `${name}:${cacheKey}` : name;
    const applyState = (next: AsyncStateSnapshot) =>
        _applyAsyncState(
            name,
            storeHandle,
            baseContext ? { ...next, correlationId: baseContext.correlationId, traceContext: baseContext.traceContext } : next,
            options,
            baseContext
        );
    const isDirectPromiseInput =
        typeof urlOrRequest !== "string"
        && typeof urlOrRequest !== "function"
        && typeof (urlOrRequest as any)?.then === "function";
    const retryPolicy = normalizeRetryOptions(name, retry, retryDelay, retryBackoff);
    let promiseRetryNoticeIssued = false;
    const shouldWarnPromiseRetry = isDirectPromiseInput && retry > 0;

    const isProdServer = typeof window === "undefined"
        && (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined) === "production";
    const autoCreate = options.autoCreate ?? getConfig().asyncAutoCreate;
    const cloneMode = options.cloneResult ?? getConfig().asyncCloneResult;

    if (stateAdapter && !hasStore(name)) {
        return reportAsyncUsageError(
            name,
            `fetchStore("${name}") with stateAdapter requires an existing backing store.\n` +
            `Call createStore("${name}", ...) first or omit stateAdapter to use the default AsyncState shape.`,
            onError
        );
    }

    if (!hasStore(name) && isProdServer) {
        return reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot create a backing store on the server in production.\n` +
            `Use createStoreForRequest(...) inside the request scope or create the store ahead of time with { allowSSRGlobalStore: true }.`,
            onError
        );
    }

    if (!hasStore(name)) {
        if (!autoCreate) {
            return reportAsyncUsageError(
                name,
                `fetchStore("${name}") requires an existing backing store when autoCreate is disabled.\n` +
                `Call createStore("${name}", ...) first or enable autoCreate.`,
                onError
            );
        }
        if (isDev()) {
            warnOnce("autoCreate", name, () => {
                const message =
                    `fetchStore("${name}") auto-created its backing store.\n` +
                    `Call createStore("${name}", ...) first to avoid typos creating phantom stores.`;
                onError?.(message);
                warn(message);
            });
        }
        createStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        } as AsyncState);
        if (!hasStore(name)) {
            return reportAsyncUsageError(
                name,
                `fetchStore("${name}") could not initialize its backing store.\n` +
                `On the server in production, use createStoreForRequest(...) inside the request scope ` +
                `or create the store with { allowSSRGlobalStore: true } before calling fetchStore.`,
                onError
            );
        }
    }

    if (!stateAdapter) {
        const existing = getStore({ name } as StoreDefinition<string, unknown>);
        if (existing && !looksLikeAsyncState(existing)) {
            warnOnce("shape", name, () => {});
            return reportAsyncUsageError(
                name,
                `fetchStore("${name}") cannot write AsyncState into an existing non-async store. ` +
                `Provide a stateAdapter or create the store with the async shape to avoid overwriting fields.`,
                onError
            );
        }
    }
    ensureCleanupSubscription(name);

    let cachedData: unknown = null;
    let backgroundRevalidate = false;
    const readCachedData = () => cacheMeta[cacheSlot]?.data ?? null;

    if (shouldUseCache(cacheSlot, ttl)) {
        asyncMetrics.cacheHits += 1;
        cachedData = readCachedData();
        applyState({
            data: cachedData,
            loading: staleWhileRevalidate,
            error: null,
            status: "success",
            cached: true,
            revalidating: staleWhileRevalidate,
        });
        if (!staleWhileRevalidate) return cachedData;
        backgroundRevalidate = true;
    } else {
        asyncMetrics.cacheMisses += 1;
    }

    if (dedupe) {
        const deduped = tryDedupeRequest(name, cacheSlot, transform, onError);
        if (deduped !== undefined) return deduped;
    }

    const nowTs = Date.now();
    pruneRateCounters(nowTs);
    scheduleRatePrune();
    if (registerRateHit(cacheSlot, nowTs)) {
        return reportAsyncUsageError(
            name,
            `fetchStore("${name}") rate limited: ${RATE_MAX} requests per ${RATE_WINDOW_MS}ms window for cacheSlot "${cacheSlot}".`,
            onError
        );
    }

    if (!hasInflightEntry(cacheSlot) && countInflightSlots(name) >= MAX_INFLIGHT_SLOTS_PER_STORE) {
        return reportAsyncUsageError(
            name,
            `fetchStore("${name}") exceeded ${MAX_INFLIGHT_SLOTS_PER_STORE} concurrent request slots. Reuse cacheKey values, wait for pending requests, or delete the store to clear async state.`,
            onError
        );
    }

    const currentVersion = reserveRequestVersion(cacheSlot);

    if (!backgroundRevalidate) {
        applyState({
            loading: true,
            error: null,
            status: "loading",
            cached: false,
            revalidating: false,
        });
    }

    asyncMetrics.requests += 1;
    const startedAt = Date.now();

    const controller = !signal && typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
    const mergedSignal = signal || controller?.signal;
    const abortOnCleanup = controller
        ? () => {
            if (!controller.signal.aborted) controller.abort();
        }
        : null;

    if (abortOnCleanup) {
        registerStoreCleanup(name, abortOnCleanup);
    }

    const executeFetch = async (): Promise<{ raw: unknown; transformed: unknown } | null> => {
        let attempts = 0;
        let delayMs = retryPolicy.retryDelay;
        while (true) {
            if (mergedSignal?.aborted) {
                return _settleAbort(name, cacheSlot, currentVersion, applyState);
            }

            const currentRequest = typeof urlOrRequest === "function" ? urlOrRequest() : urlOrRequest;
            const isPromiseRequest = isDirectPromiseInput
                || (typeof currentRequest !== "string" && typeof (currentRequest as any)?.then === "function");
            const effectiveRetryPolicy = isPromiseRequest ? { ...retryPolicy, retry: 0 } : retryPolicy;
            if (isPromiseRequest && (retry > 0 || shouldWarnPromiseRetry) && !promiseRetryNoticeIssued) {
                warn(`fetchStore("${name}") ignores retry settings for direct Promise inputs; pass a URL string or factory to use retries.`);
                promiseRetryNoticeIssued = true;
            }

            try {
                let result: unknown;

                if (typeof currentRequest === "string") {
                    const fetchOptions = buildFetchOptions({
                        method,
                        headers,
                        body,
                        signal: mergedSignal,
                        ...options,
                    });
                    const response = await fetch(currentRequest, fetchOptions);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    result = await parseResponseBody(response, responseType);
                } else if (typeof (currentRequest as any).then === "function") {
                    result = await currentRequest;
                } else {
                    error(
                        `fetchStore("${name}") - second argument must be a URL string, Promise, or Promise factory.\n` +
                        `Examples:\n` +
                        `  fetchStore("users", "https://api.example.com/users")\n` +
                        `  fetchStore("users", () => fetch("https://api.example.com/users"))`
                    );
                    return null;
                }

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion, applyState);
                }

                const transformed = transform ? transform(result) : result;
                if (transformed && typeof (transformed as any).then === "function") {
                    return reportAsyncUsageError(
                        name,
                        `fetchStore("${name}") transform must be synchronous. Return the transformed value directly instead of a Promise.`,
                        onError
                    );
                }

                if (cloneMode === "none" && isDev() && transformed && typeof transformed === "object") {
                    warnOnce("mutableResult", name, () => {
                        warn(
                            `fetchStore("${name}") received a mutable object while asyncCloneResult is "none".\n` +
                            `Async data is stored by reference; mutations will affect cache and subscribers.\n` +
                            `Set cloneResult: "deep" (per call) or configureStroid({ asyncCloneResult: "deep" }).`
                        );
                    });
                }

                const cloned = cloneAsyncResult(transformed, cloneMode);

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion, applyState);
                }

                if (!isCurrentRequest(cacheSlot, currentVersion)) {
                    return null; // stale, ignore
                }

                cacheMeta[cacheSlot] = {
                    timestamp: Date.now(),
                    expiresAt: ttl ? Date.now() + ttl : null,
                    data: cloned,
                };
                pruneAsyncCache(name);

                applyState({
                    data: cloned,
                    loading: false,
                    error: null,
                    status: "success",
                    cached: false,
                    revalidating: false,
                });

                runAsyncHook(name, "onSuccess", onSuccess, cloned);
                const elapsed = Date.now() - startedAt;
                asyncMetrics.lastMs = elapsed;
                asyncMetrics.avgMs = ((asyncMetrics.avgMs * (asyncMetrics.requests - 1)) + elapsed) / asyncMetrics.requests;
                return { raw: result, transformed: cloned };
            } catch (err) {
                attempts += 1;
                const isAbort = (err as any)?.name === "AbortError";
                if (isAbort) {
                    return _settleAbort(name, cacheSlot, currentVersion, applyState);
                }

                if (attempts <= effectiveRetryPolicy.retry) {
                    if (mergedSignal?.aborted) return _settleAbort(name, cacheSlot, currentVersion, applyState);
                    await delay(delayMs, mergedSignal);
                    if (mergedSignal?.aborted) return _settleAbort(name, cacheSlot, currentVersion, applyState);
                    delayMs = Math.min(MAX_RETRY_DELAY_MS, delayMs * effectiveRetryPolicy.retryBackoff);
                    continue;
                }

                if (!isCurrentRequest(cacheSlot, currentVersion)) return null;

                const errorMessage = (err as any)?.message || "Something went wrong";
                applyState({
                    data: backgroundRevalidate ? readCachedData() : null,
                    loading: false,
                    error: errorMessage,
                    status: "error",
                    cached: backgroundRevalidate,
                    revalidating: false,
                });

                runAsyncHook(name, "onError", onError, errorMessage);
                asyncMetrics.failures += 1;
                warn(`fetchStore("${name}") failed: ${errorMessage}`);
                return null;
            }
        }
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<{ raw: unknown; transformed: unknown } | null>((_, reject) => {
        if (signal) return;
        timeoutId = setTimeout(() => {
            timeoutId = null;
            reject(new Error("Timeout: async request hung for 60 seconds without an AbortSignal"));
        }, 60000);
    });

    const execution = Promise.race([
        executeFetch().finally(() => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        }),
        timeoutPromise,
    ]).catch((err) => {
        const errorMessage = (err as any)?.message || "Request timed out";
        applyState({
            data: backgroundRevalidate ? readCachedData() : null,
            loading: false,
            error: errorMessage,
            status: "error",
            cached: backgroundRevalidate,
            revalidating: false,
        });
        runAsyncHook(name, "onError", onError, errorMessage);
        asyncMetrics.failures += 1;
        warn(`fetchStore("${name}") failed: ${errorMessage}`);
        return null;
    });

    const promise = execution.then((res) => res?.transformed ?? null).finally(() => {
        clearInflightEntry(cacheSlot);
        clearRequestVersion(cacheSlot, currentVersion);
        if (abortOnCleanup) unregisterStoreCleanup(name, abortOnCleanup);
    });
    const rawPromise = execution.then((res) => res?.raw);

    setInflightEntry(cacheSlot, { promise, raw: rawPromise, transform });
    if (typeof urlOrRequest === "function") {
        fetchRegistry[name] = { kind: "factory", factory: urlOrRequest, options: { ...options, cacheKey } };
    } else if (typeof urlOrRequest === "string") {
        fetchRegistry[name] = { kind: "url", url: urlOrRequest, options: { ...options, cacheKey } };
    } else {
        delete fetchRegistry[name];
    }

    return promise;
}

export function refetchStore<Name extends string, State>(name: StoreDefinition<Name, State>): Promise<unknown>;
export function refetchStore<Name extends string, State>(name: StoreKey<Name, State>): Promise<unknown>;
export function refetchStore<Name extends StoreName>(name: Name): Promise<unknown>;
export async function refetchStore(nameInput: string | StoreDefinition<string, unknown>): Promise<unknown> {
    const name = nameOf(nameInput as StoreDefinition<string, unknown>);
    if (!hasStore(name)) return undefined;
    const fetchRegistry = getFetchRegistry();
    const last = fetchRegistry[name];
    if (!last) {
        // Fallback: if we don't have a replayable fetch recipe (e.g. direct Promise input),
        // return the most recent cached value for this store when available.
        const prefix = `${name}:`;
        const cacheMeta = getCacheMeta();
        const slots = Object.entries(cacheMeta).filter(([key]) =>
            key === name || key.startsWith(prefix)
        );

        if (slots.length > 0) {
            const [, meta] = slots.reduce(
                (latest, entry) =>
                    entry[1].timestamp >= latest[1].timestamp ? entry : latest
            );
            return meta.data;
        }

        if (isDev()) {
            warn(
                `refetchStore("${name}") - no previous fetch found.\n` +
                `Call fetchStore("${name}", url) first.`
            );
        }
        return undefined;
    }
    const handle = { name } as StoreDefinition<string, AsyncState>;
    if (last.kind === "factory") {
        return fetchStore(handle, last.factory, last.options);
    }
    return fetchStore(handle, last.url, last.options);
}

export function enableRevalidateOnFocus<Name extends string, State>(
    name: StoreDefinition<Name, State>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus<Name extends string, State>(
    name: StoreKey<Name, State>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus<Name extends StoreName>(
    name?: Name | "*",
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus(
    nameInput?: string | StoreDefinition<string, unknown>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void) {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const revalidateKeys = getRevalidateKeys();
    const revalidateHandlers = getRevalidateHandlers();
    const resolvedName = nameInput === "*" ? "*" : (nameInput ? nameOf(nameInput as StoreDefinition<string, unknown>) : undefined);
    const key = resolvedName ?? "*";
    if (revalidateKeys.has(key)) return revalidateHandlers[key] ?? (() => {});
    const focusConfig = getConfig().revalidateOnFocus;
    const debounceMs = Math.max(0, overrides?.debounceMs ?? focusConfig.debounceMs);
    const maxConcurrent = Math.max(1, overrides?.maxConcurrent ?? focusConfig.maxConcurrent);
    const staggerMs = Math.max(0, overrides?.staggerMs ?? focusConfig.staggerMs);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const runRefetch = () => {
        const fetchRegistry = getFetchRegistry();
        let targets = key === "*" ? Object.keys(fetchRegistry) : [key];
        if (overrides?.priority === "high" && key !== "*") {
            targets = [key, ...targets.filter((t) => t !== key)];
        }
        if (targets.length === 0) return;
        let index = 0;
        const launchNext = () => {
            const batch = targets.slice(index, index + maxConcurrent);
            batch.forEach((storeName, offset) => {
                const fire = () => {
                    const fetchRegistry = getFetchRegistry();
                    const last = fetchRegistry[storeName];
                    if (!last) {
                        void refetchStore({ name: storeName } as StoreDefinition<string, AsyncState>);
                        return;
                    }
                    if (last.kind === "factory") {
                        void fetchStore({ name: storeName } as StoreDefinition<string, AsyncState>, last.factory, last.options);
                    } else {
                        void fetchStore({ name: storeName } as StoreDefinition<string, AsyncState>, last.url, last.options);
                    }
                };
                if (staggerMs > 0) {
                    setTimeout(fire, offset * staggerMs);
                } else {
                    fire();
                }
            });
            index += batch.length;
            if (index < targets.length) {
                const delayMs = staggerMs > 0 ? staggerMs * Math.max(1, batch.length) : 0;
                setTimeout(launchNext, delayMs);
            }
        };
        launchNext();
    };

    const handler = () => {
        // For zero-debounce configs, run immediately to avoid relying on timers
        // (helps test environments and keeps default behaviour snappy).
        if (debounceMs === 0) {
            runRefetch();
            return;
        }
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runRefetch, debounceMs);
    };

    window.addEventListener("focus", handler);
    window.addEventListener("online", handler);
    revalidateKeys.add(key);
    const cleanup = () => {
        window.removeEventListener("focus", handler);
        window.removeEventListener("online", handler);
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        revalidateKeys.delete(key);
        delete revalidateHandlers[key];
        if (key !== "*") {
            unregisterStoreCleanup(key, cleanup);
        } else {
            const wildcardCleanups = getWildcardCleanups();
            const idx = wildcardCleanups.indexOf(cleanup);
            if (idx !== -1) wildcardCleanups.splice(idx, 1);
        }
    };
    revalidateHandlers[key] = cleanup;
    if (key !== "*") {
        registerStoreCleanup(key, cleanup);
    } else {
        getWildcardCleanups().push(cleanup);
    }
    return cleanup;
}

export const getAsyncMetrics = () => ({ ...getAsyncMetricsRegistry() });

export const _resetAsyncStateForTests = (): void => {
    cleanupAllRevalidateHandlers();
    resetAsyncState();
};
export const cleanupAllRevalidateHandlers = (): void => {
    const wildcardCleanups = getWildcardCleanups();
    wildcardCleanups.forEach((fn) => fn());
    wildcardCleanups.length = 0;
};


