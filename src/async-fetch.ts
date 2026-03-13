import { createStore, setStore, hasStore } from "./store.js";
import { error, warn, isDev, critical, deepClone, shallowClone } from "./utils.js";
import { getConfig } from "./internals/config.js";
import { nameOf, type StoreDefinition, type StoreKey, type StoreName, type UnregisteredStoreName } from "./store-lifecycle.js";
import {
    asyncMetrics,
    cacheMeta,
    cleanupSubs,
    countInflightSlots,
    fetchRegistry,
    inflight,
    MAX_INFLIGHT_SLOTS_PER_STORE,
    noSignalWarned,
    autoCreateWarned,
    ensureCleanupSubscription,
    pruneAsyncCache,
    registerStoreCleanup,
    requestVersion,
    revalidateHandlers,
    revalidateKeys,
    shouldUseCache,
    storeCleanupFns,
    unregisterStoreCleanup,
    rateWindowStart,
    rateCount,
    ratePruneState,
    type FetchInput,
    type FetchOptions,
} from "./async-cache.js";
import { resetAsyncState } from "./async-cache.js";
import { delay, normalizeRetryOptions, MAX_RETRY_DELAY_MS } from "./async-retry.js";
const _wildcardCleanups: Array<() => void> = [];
type AsyncState = {
    data: unknown;
    loading: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
    cached?: boolean;
    revalidating?: boolean;
};

type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };

const RATE_WINDOW_MS = 1000;
const RATE_MAX = 100;
const _pruneRateCounters = (nowTs: number): void => {
    if (nowTs - ratePruneState.lastAt < RATE_WINDOW_MS) return;
    ratePruneState.lastAt = nowTs;
    Object.keys(rateWindowStart).forEach((key) => {
        if (nowTs - (rateWindowStart[key] ?? 0) > RATE_WINDOW_MS) {
            delete rateWindowStart[key];
            delete rateCount[key];
        }
    });
};

const _runAsyncHook = (
    name: string,
    label: "onSuccess" | "onError",
    fn: ((value: any) => void) | undefined,
    value: unknown
): void => {
    if (typeof fn !== "function") return;
    try {
        fn(value);
    } catch (err) {
        warn(`fetchStore("${name}") ${label} callback failed: ${(err as { message?: string })?.message ?? err}`);
    }
};

const _reportAsyncUsageError = (
    name: string,
    message: string,
    onError?: (message: string) => void
): null => {
    _runAsyncHook(name, "onError", onError, message);
    if (isDev()) {
        error(message);
        return null;
    }
    critical(message);
    return null;
};

const _throwAsyncUsageError = (
    name: string,
    message: string,
    onError?: (message: string) => void
): never => {
    _runAsyncHook(name, "onError", onError, message);
    if (isDev()) {
        error(message);
    } else {
        critical(message);
    }
    throw new Error(message);
};

const _isCurrentRequest = (cacheSlot: string, version: number): boolean =>
    (requestVersion[cacheSlot] ?? 0) === version;

const _settleAbort = (name: string, cacheSlot: string, version: number): null => {
    warn(`fetchStore("${name}") aborted`);
    if (_isCurrentRequest(cacheSlot, version) && hasStore(name)) {
        setStore(name, {
            loading: false,
            error: "aborted",
            status: "aborted",
            revalidating: false,
        });
    }
    return null;
};

const cloneAsyncResult = (value: unknown, mode: FetchOptions["cloneResult"]): unknown => {
    if (!mode || mode === "none") return value;
    if (value === null || typeof value !== "object") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
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
export function fetchStore<Name extends string>(
    name: UnregisteredStoreName<Name>,
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

    if (!urlOrRequest) {
        error(`fetchStore("${name}") requires a URL, Promise, or Promise factory as second argument`);
        return;
    }

    const {
        transform,
        onSuccess,
        onError,
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

    if (!signal && isDev() && !noSignalWarned.has(name)) {
        noSignalWarned.add(name);
        warn(
            `fetchStore("${name}") called without an AbortSignal. Provide "signal" to enable cancellation (recommended).`
        );
    }

    const cacheSlot = cacheKey ? `${name}:${cacheKey}` : name;
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

    if (!hasStore(name) && isProdServer) {
        return _reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot create a backing store on the server in production.\n` +
            `Use createStoreForRequest(...) inside the request scope or create the store ahead of time with { allowSSRGlobalStore: true }.`,
            onError
        );
    }

    if (!hasStore(name)) {
        if (!autoCreate) {
            return _reportAsyncUsageError(
                name,
                `fetchStore("${name}") requires an existing backing store when autoCreate is disabled.\n` +
                `Call createStore("${name}", ...) first or enable autoCreate.`,
                onError
            );
        }
        if (isDev() && !autoCreateWarned.has(name)) {
            autoCreateWarned.add(name);
            const message =
                `fetchStore("${name}") auto-created its backing store.\n` +
                `Call createStore("${name}", ...) first to avoid typos creating phantom stores.`;
            onError?.(message);
            warn(message);
        }
        createStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        } as AsyncState);
        if (!hasStore(name)) {
            return _reportAsyncUsageError(
                name,
                `fetchStore("${name}") could not initialize its backing store.\n` +
                `On the server in production, use createStoreForRequest(...) inside the request scope ` +
                `or create the store with { allowSSRGlobalStore: true } before calling fetchStore.`,
                onError
            );
        }
    }
    ensureCleanupSubscription(name);

    let cachedData: unknown = null;
    let backgroundRevalidate = false;

    if (shouldUseCache(cacheSlot, ttl)) {
        asyncMetrics.cacheHits += 1;
        cachedData = cacheMeta[cacheSlot].data;
        setStore(name, {
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

    if (dedupe && inflight[cacheSlot]) {
        const active = inflight[cacheSlot] as InflightEntry;
        asyncMetrics.dedupes += 1;
        if (transform && active.transform && active.transform !== transform) {
            _reportAsyncUsageError(
                name,
                `fetchStore("${name}") cannot dedupe callers that use different transform functions for cacheSlot "${cacheSlot}".`,
                onError
            );
            return null;
        }
        if (!transform || active.transform === transform) return active.promise;
        return active.raw.then((raw) => transform(raw));
    }

    const nowTs = Date.now();
    _pruneRateCounters(nowTs);
    const windowStart = rateWindowStart[cacheSlot];
    const currentCount = rateCount[cacheSlot] ?? 0;
    if (windowStart !== undefined && nowTs - windowStart < RATE_WINDOW_MS) {
        if (currentCount >= RATE_MAX) {
            return _reportAsyncUsageError(
                name,
                `fetchStore("${name}") rate limited: ${RATE_MAX} requests per ${RATE_WINDOW_MS}ms window for cacheSlot "${cacheSlot}".`,
                onError
            );
        }
        rateCount[cacheSlot] = currentCount + 1;
    } else {
        rateWindowStart[cacheSlot] = nowTs;
        rateCount[cacheSlot] = 1;
    }

    if (!inflight[cacheSlot] && countInflightSlots(name) >= MAX_INFLIGHT_SLOTS_PER_STORE) {
        return _throwAsyncUsageError(
            name,
            `fetchStore("${name}") exceeded ${MAX_INFLIGHT_SLOTS_PER_STORE} concurrent request slots. Reuse cacheKey values, wait for pending requests, or delete the store to clear async state.`,
            onError
        );
    }

    const currentVersion = (requestVersion[cacheSlot] ?? 0) + 1;
    requestVersion[cacheSlot] = currentVersion;

    if (!backgroundRevalidate) {
        setStore(name, {
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
                return _settleAbort(name, cacheSlot, currentVersion);
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
                    const fetchOptions = _buildFetchOptions({
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
                    result = await _parseResponseBody(response, responseType);
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
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                const transformed = transform ? transform(result) : result;
                if (transformed && typeof (transformed as any).then === "function") {
                    return _reportAsyncUsageError(
                        name,
                        `fetchStore("${name}") transform must be synchronous. Return the transformed value directly instead of a Promise.`,
                        onError
                    );
                }

                const cloned = cloneAsyncResult(transformed, cloneMode);

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                if (!_isCurrentRequest(cacheSlot, currentVersion)) {
                    return null; // stale, ignore
                }

                cacheMeta[cacheSlot] = {
                    timestamp: Date.now(),
                    expiresAt: ttl ? Date.now() + ttl : null,
                    data: cloned,
                };
                pruneAsyncCache(name);

                if (hasStore(name)) {
                    setStore(name, {
                        data: cloned,
                        loading: false,
                        error: null,
                        status: "success",
                        cached: false,
                        revalidating: false,
                    });
                }

                _runAsyncHook(name, "onSuccess", onSuccess, cloned);
                const elapsed = Date.now() - startedAt;
                asyncMetrics.lastMs = elapsed;
                asyncMetrics.avgMs = ((asyncMetrics.avgMs * (asyncMetrics.requests - 1)) + elapsed) / asyncMetrics.requests;
                return { raw: result, transformed: cloned };
            } catch (err) {
                attempts += 1;
                const isAbort = (err as any)?.name === "AbortError";
                if (isAbort) {
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                if (attempts <= effectiveRetryPolicy.retry) {
                    if (mergedSignal?.aborted) return _settleAbort(name, cacheSlot, currentVersion);
                    await delay(delayMs, mergedSignal);
                    if (mergedSignal?.aborted) return _settleAbort(name, cacheSlot, currentVersion);
                    delayMs = Math.min(MAX_RETRY_DELAY_MS, delayMs * effectiveRetryPolicy.retryBackoff);
                    continue;
                }

                if (!_isCurrentRequest(cacheSlot, currentVersion)) return null;

                const errorMessage = (err as any)?.message || "Something went wrong";
                if (hasStore(name)) {
                    setStore(name, {
                        data: backgroundRevalidate ? cachedData : null,
                        loading: false,
                        error: errorMessage,
                        status: "error",
                        cached: backgroundRevalidate,
                        revalidating: false,
                    });
                }

                _runAsyncHook(name, "onError", onError, errorMessage);
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
        if (hasStore(name)) {
            setStore(name, {
                data: backgroundRevalidate ? cachedData : null,
                loading: false,
                error: errorMessage,
                status: "error",
                cached: backgroundRevalidate,
                revalidating: false,
            });
        }
        _runAsyncHook(name, "onError", onError, errorMessage);
        asyncMetrics.failures += 1;
        warn(`fetchStore("${name}") failed: ${errorMessage}`);
        return null;
    });

    const promise = execution.then((res) => res?.transformed ?? null).finally(() => {
        delete inflight[cacheSlot];
        if (requestVersion[cacheSlot] === currentVersion) {
            delete requestVersion[cacheSlot];
        }
        if (abortOnCleanup) unregisterStoreCleanup(name, abortOnCleanup);
    });
    const rawPromise = execution.then((res) => res?.raw);

    (inflight as Record<string, InflightEntry>)[cacheSlot] = { promise, raw: rawPromise, transform };
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
export function refetchStore<Name extends string>(name: UnregisteredStoreName<Name>): Promise<unknown>;
export function refetchStore<Name extends StoreName>(name: Name): Promise<unknown>;
export async function refetchStore(nameInput: string | StoreDefinition<string, unknown>): Promise<unknown> {
    const name = nameOf(nameInput as StoreDefinition<string, unknown>);
    if (!hasStore(name)) return undefined;
    const last = fetchRegistry[name];
    if (!last) {
        // Fallback: if we don't have a replayable fetch recipe (e.g. direct Promise input),
        // return the most recent cached value for this store when available.
        const prefix = `${name}:`;
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
    if (last.kind === "factory") {
        return fetchStore(name, last.factory, last.options);
    }
    return fetchStore(name, last.url, last.options);
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
    const resolvedName = nameInput === "*" ? "*" : (nameInput ? nameOf(nameInput as StoreDefinition<string, unknown>) : undefined);
    const key = resolvedName ?? "*";
    if (revalidateKeys.has(key)) return revalidateHandlers[key] ?? (() => {});
    const focusConfig = getConfig().revalidateOnFocus;
    const debounceMs = Math.max(0, overrides?.debounceMs ?? focusConfig.debounceMs);
    const maxConcurrent = Math.max(1, overrides?.maxConcurrent ?? focusConfig.maxConcurrent);
    const staggerMs = Math.max(0, overrides?.staggerMs ?? focusConfig.staggerMs);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const runRefetch = () => {
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
                    const last = fetchRegistry[storeName];
                    if (!last) {
                        void refetchStore(storeName);
                        return;
                    }
                    if (last.kind === "factory") {
                        void fetchStore(storeName, last.factory, last.options);
                    } else {
                        void fetchStore(storeName, last.url, last.options);
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
            const idx = _wildcardCleanups.indexOf(cleanup);
            if (idx !== -1) _wildcardCleanups.splice(idx, 1);
        }
    };
    revalidateHandlers[key] = cleanup;
    if (key !== "*") {
        registerStoreCleanup(key, cleanup);
    } else {
        _wildcardCleanups.push(cleanup);
    }
    return cleanup;
}

const _buildFetchOptions = (options: FetchOptions): RequestInit => {
    const fetchOpts: RequestInit = {};

    if (options.method) {
        fetchOpts.method = options.method.toUpperCase();
    }

    if (options.headers) {
        fetchOpts.headers = options.headers;
    } else {
        fetchOpts.headers = { "Content-Type": "application/json" };
    }

    if (options.body) {
        fetchOpts.body = typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
    }

    if (options.signal) {
        fetchOpts.signal = options.signal;
    }

    return fetchOpts;
};

const _parseResponseBody = async (response: Response, responseType: FetchOptions["responseType"]): Promise<unknown> => {
    const type = responseType ?? "auto";
    if (type === "json") return response.json();
    if (type === "text") return response.text();
    if (type === "arrayBuffer") return response.arrayBuffer();
    if (type === "blob") return response.blob();
    if (type === "formData") return response.formData();

    // auto-detect
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json") || contentType.includes("+json")) {
        return response.json();
    }
    if (contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("html")) {
        return response.text();
    }
    if (contentType.includes("form-data")) return response.formData();
    return response.arrayBuffer();
};

export const getAsyncMetrics = () => ({ ...asyncMetrics });

export const _resetAsyncStateForTests = (): void => resetAsyncState();
export const cleanupAllRevalidateHandlers = (): void => {
    _wildcardCleanups.forEach(fn => fn());
    _wildcardCleanups.length = 0;
};
