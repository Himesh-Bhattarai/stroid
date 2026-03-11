import { createStore, setStore, hasStore } from "./store.js";
import { error, warn, isDev } from "./utils.js";
import { getConfig } from "./internals/config.js";
import {
    asyncMetrics,
    cacheMeta,
    cleanupSubs,
    countInflightSlots,
    fetchRegistry,
    inflight,
    MAX_INFLIGHT_SLOTS_PER_STORE,
    noSignalWarned,
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
    type FetchInput,
    type FetchOptions,
} from "./async-cache.js";
import { resetAsyncState } from "./async-cache.js";
import { delay, normalizeRetryOptions, MAX_RETRY_DELAY_MS } from "./async-retry.js";

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
    if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error(`[stroid] ${message}`);
    }
    return null;
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

export const fetchStore = async (
    name: string,
    urlOrRequest: FetchInput,
    options: FetchOptions = {}
): Promise<unknown> => {
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
    const retryPolicy = normalizeRetryOptions(name, retry, retryDelay, retryBackoff);
    let promiseRetryNoticeIssued = false;

    const isProdServer = typeof window === "undefined"
        && (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined) === "production";

    if (!hasStore(name) && isProdServer) {
        return _reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot create a backing store on the server in production.\n` +
            `Use createStoreForRequest(...) inside the request scope or create the store ahead of time with { allowSSRGlobalStore: true }.`,
            onError
        );
    }

    if (!hasStore(name)) {
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
    const windowStart = rateWindowStart[cacheSlot] ?? nowTs;
    const currentCount = rateCount[cacheSlot] ?? 0;
    if (nowTs - windowStart < RATE_WINDOW_MS) {
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
        return _reportAsyncUsageError(
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
            const isPromiseRequest = typeof currentRequest !== "string" && typeof (currentRequest as any)?.then === "function";
            const effectiveRetryPolicy = isPromiseRequest ? { ...retryPolicy, retry: 0 } : retryPolicy;
            if (isPromiseRequest && retryPolicy.retry > 0 && !promiseRetryNoticeIssued) {
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

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                if (!_isCurrentRequest(cacheSlot, currentVersion)) {
                    return null; // stale, ignore
                }

                cacheMeta[cacheSlot] = {
                    timestamp: Date.now(),
                    expiresAt: ttl ? Date.now() + ttl : null,
                    data: transformed,
                };
                pruneAsyncCache(name);

                if (hasStore(name)) {
                    setStore(name, {
                        data: transformed,
                        loading: false,
                        error: null,
                        status: "success",
                        cached: false,
                        revalidating: false,
                    });
                }

                _runAsyncHook(name, "onSuccess", onSuccess, transformed);
                const elapsed = Date.now() - startedAt;
                asyncMetrics.lastMs = elapsed;
                asyncMetrics.avgMs = ((asyncMetrics.avgMs * (asyncMetrics.requests - 1)) + elapsed) / asyncMetrics.requests;
                return { raw: result, transformed };
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

    const execution = Promise.race([
        executeFetch(),
        new Promise<{ raw: unknown; transformed: unknown } | null>((_, reject) => {
            if (mergedSignal) return;
            setTimeout(() => reject(new Error("Timeout: async request hung for 60 seconds without an AbortSignal")), 60000);
        })
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
};

export const refetchStore = async (name: string): Promise<unknown> => {
    if (!hasStore(name)) return undefined;
    const last = fetchRegistry[name];
    if (!last) {
        if (isDev()) {
            warn(
                `refetchStore("${name}") - no previous fetch found.\n` +
                `Call fetchStore("${name}", url) first.`
            );
        }
        return;
    }
    if (last.kind === "factory") {
        return fetchStore(name, last.factory, last.options);
    }
    return fetchStore(name, last.url, last.options);
};

export const enableRevalidateOnFocus = (name?: string, overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }): (() => void) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const key = name ?? "*";
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
                const fire = () => { void refetchStore(storeName); };
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
        if (key !== "*") unregisterStoreCleanup(key, cleanup);
    };
    revalidateHandlers[key] = cleanup;
    if (key !== "*") registerStoreCleanup(key, cleanup);
    return cleanup;
};

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
