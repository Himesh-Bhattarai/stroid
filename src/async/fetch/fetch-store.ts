/**
 * @module async/fetch/fetch-store
 *
 * LAYER: Module
 * OWNS:  Core fetchStore request pipeline.
 */
import { createStore, getStore, hasStore } from "../../internals/store-ops.js";
import { error, isDev, warn } from "../../utils.js";
import { getConfig } from "../../internals/config.js";
import { nameOf } from "../../core/store-lifecycle/identity.js";
import type { StoreDefinition, StoreKey, StoreName } from "../../core/store-lifecycle/types.js";
import {
    countInflightSlots,
    ensureCleanupSubscription,
    getCacheMeta,
    getFetchRegistry,
    getOrCreateAsyncStoreMetrics,
    getAsyncMetrics as getAsyncMetricsRegistry,
    MAX_INFLIGHT_SLOTS_PER_STORE,
    noteAsyncCacheWrite,
    pruneAsyncCache,
    registerStoreCleanup,
    shouldUseCache,
    trackAsyncSlot,
    unregisterStoreCleanup,
    warnOnce,
    type AsyncStateSnapshot,
    type FetchInput,
    type FetchOptions,
} from "../cache.js";
import { cloneAsyncResult } from "../clone.js";
import { reportAsyncUsageError, runAsyncHook } from "../errors.js";
import {
    clearInflightEntry,
    clearRequestVersion,
    hasInflightEntry,
    isCurrentRequest,
    reserveRequestVersion,
    setInflightEntry,
    tryDedupeRequest,
    type InflightRequestContract,
} from "../inflight.js";
import { RATE_MAX, RATE_WINDOW_MS, pruneRateCounters, registerRateHit, scheduleRatePrune } from "../rate.js";
import { buildFetchOptions, parseResponseBody } from "../request.js";
import { delay, MAX_RETRY_DELAY_MS, normalizeRetryOptions } from "../retry.js";
import { safeInvoke } from "../../internals/reporting.js";
import type { WriteContext } from "../../internals/write-context.js";
import { applyAsyncState, AsyncState, isPromiseLike, looksLikeAsyncState, settleAbort } from "./shared.js";

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
    const storeMetrics = getOrCreateAsyncStoreMetrics(name);
    const baseContext: WriteContext | null = (() => {
        const explicit = options.correlationId;
        const trace = options.traceContext;
        if (explicit || trace) {
            return { correlationId: explicit, traceContext: trace, sourceHint: "network" };
        }
        if (getConfig().autoCorrelationIds) {
            return {
                correlationId: `stroid-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                traceContext: trace,
                sourceHint: "network",
            };
        }
        return { sourceHint: "network" };
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
        applyAsyncState(
            name,
            storeHandle,
            (baseContext && (baseContext.correlationId || baseContext.traceContext))
                ? {
                    ...next,
                    ...(baseContext.correlationId ? { correlationId: baseContext.correlationId } : {}),
                    ...(baseContext.traceContext ? { traceContext: baseContext.traceContext } : {}),
                }
                : next,
            options,
            baseContext
        );
    const isDirectPromiseInput =
        typeof urlOrRequest !== "string"
        && typeof urlOrRequest !== "function"
        && isPromiseLike(urlOrRequest);
    const retryPolicy = normalizeRetryOptions(name, retry, retryDelay, retryBackoff);
    let promiseRetryNoticeIssued = false;
    const shouldWarnPromiseRetry = isDirectPromiseInput && retry > 0;
    const dedupeContract: InflightRequestContract = (() => {
        if (typeof urlOrRequest === "string") {
            return {
                requestKind: "url",
                url: urlOrRequest,
                method: (method ?? "GET").toUpperCase(),
                headers,
                body,
                responseType,
                stateAdapter,
            };
        }
        if (typeof urlOrRequest === "function") {
            return {
                requestKind: "factory",
                requestRef: urlOrRequest,
                method: (method ?? "GET").toUpperCase(),
                headers,
                body,
                responseType,
                stateAdapter,
            };
        }
        return {
            requestKind: "promise",
            requestRef: urlOrRequest,
            stateAdapter,
        };
    })();

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
                safeInvoke(onError, `fetchStore.onError(${name})`, message);
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
        storeMetrics.cacheHits += 1;
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
        storeMetrics.cacheMisses += 1;
    }

    if (dedupe) {
        const deduped = tryDedupeRequest(name, cacheSlot, {
            contract: dedupeContract,
            transform,
            cloneResult: cloneMode,
        }, onError);
        if (deduped !== undefined) return deduped;
    }

    const nowTs = Date.now();
    pruneRateCounters(nowTs);
    scheduleRatePrune();
    if (registerRateHit(cacheSlot, nowTs, name)) {
        return reportAsyncUsageError(
            name,
            `fetchStore("${name}") rate limited: ${RATE_MAX} requests per ${RATE_WINDOW_MS}ms window for store "${name}".`,
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

    const currentVersion = reserveRequestVersion(cacheSlot, name);

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
    storeMetrics.requests += 1;
    const startedAt = Date.now();

    const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
    const mergedSignal = controller?.signal ?? signal;
    let detachCallerAbortRelay: (() => void) | null = null;
    if (controller && signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            const relayAbort = () => {
                if (!controller.signal.aborted) controller.abort();
            };
            signal.addEventListener("abort", relayAbort, { once: true });
            detachCallerAbortRelay = () => {
                signal.removeEventListener("abort", relayAbort);
            };
        }
    }
    const detachRelayCleanup = () => {
        if (!detachCallerAbortRelay) return;
        detachCallerAbortRelay();
        detachCallerAbortRelay = null;
    };
    const abortOnCleanup = controller
        ? () => {
            if (!controller.signal.aborted) controller.abort();
        }
        : null;

    if (abortOnCleanup) {
        registerStoreCleanup(name, abortOnCleanup);
    }
    if (detachCallerAbortRelay) {
        registerStoreCleanup(name, detachRelayCleanup);
    }

    const executeFetch = async (): Promise<{ raw: unknown; transformed: unknown } | null> => {
        let attempts = 0;
        let delayMs = retryPolicy.retryDelay;
        while (true) {
            if (mergedSignal?.aborted) {
                return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
            }

            const currentRequest = typeof urlOrRequest === "function" ? urlOrRequest() : urlOrRequest;
            const isPromiseRequest = isDirectPromiseInput
                || (typeof currentRequest !== "string" && isPromiseLike(currentRequest));
            const effectiveRetryPolicy = isPromiseRequest ? { ...retryPolicy, retry: 0 } : retryPolicy;
            if (isPromiseRequest && (retry > 0 || shouldWarnPromiseRetry) && !promiseRetryNoticeIssued) {
                warn(`fetchStore("${name}") ignores retry settings for direct Promise inputs; pass a URL string or factory to use retries.`);
                promiseRetryNoticeIssued = true;
            }

            try {
                let result: unknown;

                if (typeof currentRequest === "string") {
                    const fetchOptions = buildFetchOptions({
                        ...options,
                        method,
                        headers,
                        body,
                        signal: mergedSignal,
                    });
                    const response = await fetch(currentRequest, fetchOptions);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    result = await parseResponseBody(response, responseType);
                } else if (isPromiseLike(currentRequest)) {
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
                    return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
                }

                const transformed = transform ? transform(result) : result;
                if (isPromiseLike(transformed)) {
                    const errorMessage =
                        `fetchStore("${name}") transform must be synchronous. Return the transformed value directly instead of a Promise.`;
                    if (isCurrentRequest(cacheSlot, currentVersion)) {
                        applyState({
                            data: backgroundRevalidate ? readCachedData() : null,
                            loading: false,
                            error: errorMessage,
                            status: "error",
                            cached: backgroundRevalidate,
                            revalidating: false,
                        });
                    }
                    return reportAsyncUsageError(name, errorMessage, onError);
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
                    return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
                }

                if (!isCurrentRequest(cacheSlot, currentVersion)) {
                    return null; // stale, ignore
                }

                cacheMeta[cacheSlot] = {
                    timestamp: Date.now(),
                    expiresAt: ttl ? Date.now() + ttl : null,
                    data: cloned,
                };
                trackAsyncSlot(name, cacheSlot);
                if (noteAsyncCacheWrite(name)) pruneAsyncCache(name);

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
                storeMetrics.lastMs = elapsed;
                storeMetrics.avgMs = ((storeMetrics.avgMs * (storeMetrics.requests - 1)) + elapsed) / storeMetrics.requests;
                return { raw: result, transformed: cloned };
            } catch (err) {
                attempts += 1;
                const isAbort = (err as { name?: unknown })?.name === "AbortError";
                if (isAbort) {
                    return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
                }

                if (attempts <= effectiveRetryPolicy.retry) {
                    if (mergedSignal?.aborted) return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
                    await delay(delayMs, mergedSignal);
                    if (mergedSignal?.aborted) return settleAbort(name, cacheSlot, currentVersion, applyState, isCurrentRequest);
                    delayMs = Math.min(MAX_RETRY_DELAY_MS, delayMs * effectiveRetryPolicy.retryBackoff);
                    continue;
                }

                if (!isCurrentRequest(cacheSlot, currentVersion)) return null;

                const errorMessage =
                    (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string")
                        ? (err as { message: string }).message
                        : "Something went wrong";
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
                storeMetrics.failures += 1;
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
            if (controller && !controller.signal.aborted) {
                controller.abort();
            }
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
        const errorMessage =
            (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string")
                ? (err as { message: string }).message
                : "Request timed out";
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
        storeMetrics.failures += 1;
        warn(`fetchStore("${name}") failed: ${errorMessage}`);
        return null;
    });

    const promise = execution.then((res) => res?.transformed ?? null).finally(() => {
        clearInflightEntry(cacheSlot);
        clearRequestVersion(cacheSlot, currentVersion);
        if (abortOnCleanup) unregisterStoreCleanup(name, abortOnCleanup);
        if (detachCallerAbortRelay) unregisterStoreCleanup(name, detachRelayCleanup);
        detachRelayCleanup();
    });
    const rawPromise = execution.then((res) => res?.raw);

    setInflightEntry(cacheSlot, { promise, raw: rawPromise, transform, cloneResult: cloneMode, contract: dedupeContract }, name);
    if (typeof urlOrRequest === "function") {
        fetchRegistry[name] = { kind: "factory", factory: urlOrRequest, options: { ...options, cacheKey } };
    } else if (typeof urlOrRequest === "string") {
        fetchRegistry[name] = { kind: "url", url: urlOrRequest, options: { ...options, cacheKey } };
    } else {
        delete fetchRegistry[name];
    }

    return promise;
}
