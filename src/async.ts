import { createStore, setStore, hasStore, _subscribe } from "./store.js";
import { error, warn, isDev } from "./utils.js";

export interface FetchOptions {
    transform?: (result: unknown) => unknown;
    onSuccess?: (data: unknown) => void;
    onError?: (message: string) => void;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    ttl?: number; // ms
    staleWhileRevalidate?: boolean;
    dedupe?: boolean;
    retry?: number;
    retryDelay?: number;
    retryBackoff?: number;
    signal?: AbortSignal;
    cacheKey?: string;
}

type AsyncState = {
    data: unknown;
    loading: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
    cached?: boolean;
    revalidating?: boolean;
};

const _fetchRegistry: Record<string, { url: string | Promise<unknown>; options: FetchOptions }> = {};
const _inflight: Partial<Record<string, { promise: Promise<unknown>; transform?: FetchOptions["transform"] }>> = {};
const _requestVersion: Record<string, number> = {};
const _cacheMeta: Record<string, { timestamp: number; expiresAt: number | null; data: unknown }> = {};
const _noSignalWarned = new Set<string>();
const _cleanupSubs: Record<string, () => void> = {};
const _storeCleanupFns: Record<string, Set<() => void>> = {};
const MAX_RETRY_ATTEMPTS = 10;
const MIN_RETRY_DELAY_MS = 10;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_BACKOFF = 8;
const MAX_CACHE_SLOTS_PER_STORE = 100;
const MAX_INFLIGHT_SLOTS_PER_STORE = 100;

const delay = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve) => {
    if (signal?.aborted) {
        resolve();
        return;
    }

    const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
    }, ms);

    const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
});

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
    (_requestVersion[cacheSlot] ?? 0) === version;

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

const _normalizeRetryNumber = (name: string, label: "retry" | "retryDelay" | "retryBackoff", value: number, fallback: number): number => {
    if (!Number.isFinite(value)) {
        warn(`fetchStore("${name}") received non-finite ${label}; using ${fallback}.`);
        return fallback;
    }
    return value;
};

const _normalizeRetryOptions = (
    name: string,
    retry: number,
    retryDelay: number,
    retryBackoff: number
): { retry: number; retryDelay: number; retryBackoff: number } => {
    const rawRetry = Number.isFinite(retry)
        ? retry
        : (retry > 0 ? MAX_RETRY_ATTEMPTS : 0);
    const safeRetry = Math.min(
        MAX_RETRY_ATTEMPTS,
        Math.max(0, Math.trunc(rawRetry))
    );
    if (!Number.isFinite(retry)) {
        warn(`fetchStore("${name}") received non-finite retry; using ${safeRetry}.`);
    }
    const safeRetryDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(MIN_RETRY_DELAY_MS, _normalizeRetryNumber(name, "retryDelay", retryDelay, 400))
    );
    const safeRetryBackoff = Math.min(
        MAX_RETRY_BACKOFF,
        Math.max(1, _normalizeRetryNumber(name, "retryBackoff", retryBackoff, 1.7))
    );

    if (safeRetry !== retry) {
        warn(`fetchStore("${name}") clamped retry attempts to ${safeRetry}.`);
    }
    if (safeRetryDelay !== retryDelay) {
        warn(`fetchStore("${name}") clamped retryDelay to ${safeRetryDelay}ms.`);
    }
    if (safeRetryBackoff !== retryBackoff) {
        warn(`fetchStore("${name}") clamped retryBackoff to ${safeRetryBackoff}.`);
    }

    return {
        retry: safeRetry,
        retryDelay: safeRetryDelay,
        retryBackoff: safeRetryBackoff,
    };
};

const shouldUseCache = (name: string, ttl?: number): boolean => {
    if (!ttl) return false;
    const meta = _cacheMeta[name];
    if (!meta) return false;
    if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
        delete _cacheMeta[name];
        return false;
    }
    return Date.now() - meta.timestamp < ttl;
};

const _asyncMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    dedupes: 0,
    requests: 0,
    failures: 0,
    avgMs: 0,
    lastMs: 0,
};

const _clearAsyncMeta = (name: string): void => {
    delete _fetchRegistry[name];
    _noSignalWarned.delete(name);

    const startsWithName = (key: string) => key === name || key.startsWith(`${name}:`);

    Object.keys(_inflight).forEach((k) => { if (startsWithName(k)) delete _inflight[k]; });
    Object.keys(_requestVersion).forEach((k) => { if (startsWithName(k)) delete _requestVersion[k]; });
    Object.keys(_cacheMeta).forEach((k) => { if (startsWithName(k)) delete _cacheMeta[k]; });
};

const _pruneAsyncCache = (name: string): void => {
    const prefix = `${name}:`;
    const slots = Object.entries(_cacheMeta)
        .filter(([key, meta]) => {
            if (key !== name && !key.startsWith(prefix)) return false;
            if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
                delete _cacheMeta[key];
                return false;
            }
            return true;
        })
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

    if (slots.length <= MAX_CACHE_SLOTS_PER_STORE) return;
    const overflow = slots.length - MAX_CACHE_SLOTS_PER_STORE;
    slots.slice(0, overflow).forEach(([key]) => {
        delete _cacheMeta[key];
        delete _requestVersion[key];
    });
};

const _countInflightSlots = (name: string): number => {
    const prefix = `${name}:`;
    let count = 0;
    Object.keys(_inflight).forEach((key) => {
        if (key === name || key.startsWith(prefix)) count += 1;
    });
    return count;
};

const _registerStoreCleanup = (name: string, fn: () => void): void => {
    if (!_storeCleanupFns[name]) _storeCleanupFns[name] = new Set();
    _storeCleanupFns[name].add(fn);
    _ensureCleanupSubscription(name);
};

const _unregisterStoreCleanup = (name: string, fn: () => void): void => {
    const fns = _storeCleanupFns[name];
    if (!fns) return;
    fns.delete(fn);
    if (fns.size === 0) delete _storeCleanupFns[name];
};

const _ensureCleanupSubscription = (name: string): void => {
    if (_cleanupSubs[name]) return;
    _cleanupSubs[name] = _subscribe(name, (state) => {
        if (state !== null) return;
        // run registered cleanups (e.g., event listeners)
        const fns = _storeCleanupFns[name];
        if (fns) {
            fns.forEach((fn) => {
                try { fn(); } catch (_) { /* ignore cleanup errors */ }
            });
            delete _storeCleanupFns[name];
        }
        _cleanupSubs[name]?.();
        delete _cleanupSubs[name];
        _clearAsyncMeta(name);
    });
};

export const fetchStore = async (
    name: string,
    urlOrPromise: string | Promise<unknown>,
    options: FetchOptions = {}
): Promise<unknown> => {
    if (!name || typeof name !== "string") {
        error(`fetchStore requires a store name as first argument`);
        return;
    }

    if (!urlOrPromise) {
        error(`fetchStore("${name}") requires a URL or Promise as second argument`);
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
    } = options;

    if (!signal && isDev() && !_noSignalWarned.has(name)) {
        _noSignalWarned.add(name);
        warn(
            `fetchStore("${name}") called without an AbortSignal. Provide "signal" to enable cancellation (recommended).`
        );
    }

    const cacheSlot = cacheKey ? `${name}:${cacheKey}` : name;
    const isPromiseInput = typeof urlOrPromise !== "string" && typeof (urlOrPromise as any).then === "function";
    const retryPolicy = _normalizeRetryOptions(name, retry, retryDelay, retryBackoff);
    const effectiveRetryPolicy = isPromiseInput
        ? { ...retryPolicy, retry: 0 }
        : retryPolicy;

    if (isPromiseInput && retryPolicy.retry > 0) {
        warn(`fetchStore("${name}") ignores retry settings for direct Promise inputs; pass a URL string to use retries.`);
    }

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
        });
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
    _ensureCleanupSubscription(name);

    let cachedData: unknown = null;
    let backgroundRevalidate = false;

    if (shouldUseCache(cacheSlot, ttl)) {
        _asyncMetrics.cacheHits += 1;
        cachedData = _cacheMeta[cacheSlot].data;
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
        _asyncMetrics.cacheMisses += 1;
    }

    if (dedupe && _inflight[cacheSlot]) {
        const active = _inflight[cacheSlot]!;
        if (active.transform !== transform) {
            return _reportAsyncUsageError(
                name,
                `fetchStore("${name}") cannot dedupe callers that use different transform functions for the same cache slot. Use a distinct cacheKey or set dedupe: false.`,
                onError
            );
        }
        _asyncMetrics.dedupes += 1;
        return active.promise;
    }

    if (!_inflight[cacheSlot] && _countInflightSlots(name) >= MAX_INFLIGHT_SLOTS_PER_STORE) {
        return _reportAsyncUsageError(
            name,
            `fetchStore("${name}") exceeded ${MAX_INFLIGHT_SLOTS_PER_STORE} concurrent request slots. Reuse cacheKey values, wait for pending requests, or delete the store to clear async state.`,
            onError
        );
    }

    const currentVersion = (_requestVersion[cacheSlot] ?? 0) + 1;
    _requestVersion[cacheSlot] = currentVersion;

    if (!backgroundRevalidate) {
        setStore(name, {
            loading: true,
            error: null,
            status: "loading",
            cached: false,
            revalidating: false,
        });
    }

    _asyncMetrics.requests += 1;
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
        _registerStoreCleanup(name, abortOnCleanup);
    }

    const runFetch = async (): Promise<unknown> => {
        let attempts = 0;
        let delayMs = retryPolicy.retryDelay;
        while (true) {
            if (mergedSignal?.aborted) {
                return _settleAbort(name, cacheSlot, currentVersion);
            }
            try {
                let result: unknown;

                if (typeof urlOrPromise === "string") {
                    const fetchOptions = _buildFetchOptions({
                        method,
                        headers,
                        body,
                        signal: mergedSignal,
                        ...options,
                    });
                    const response = await fetch(urlOrPromise, fetchOptions);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    const contentType = response.headers.get("content-type") || "";
                    if (contentType.includes("application/json")) {
                        result = await response.json();
                    } else {
                        result = await response.text();
                    }
                } else if (typeof (urlOrPromise as any).then === "function") {
                    result = await urlOrPromise;
                } else {
                    error(
                        `fetchStore("${name}") - second argument must be a URL string or Promise.\n` +
                        `Examples:\n` +
                        `  fetchStore("users", "https://api.example.com/users")\n` +
                        `  fetchStore("users", axios.get("/users"))`
                    );
                    return null;
                }

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                const transformed = transform ? transform(result) : result;

                if (mergedSignal?.aborted) {
                    return _settleAbort(name, cacheSlot, currentVersion);
                }

                if (!_isCurrentRequest(cacheSlot, currentVersion)) {
                    return null; // stale, ignore
                }

                _cacheMeta[cacheSlot] = {
                    timestamp: Date.now(),
                    expiresAt: ttl ? Date.now() + ttl : null,
                    data: transformed,
                };
                _pruneAsyncCache(name);

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
                _asyncMetrics.lastMs = elapsed;
                _asyncMetrics.avgMs = ((_asyncMetrics.avgMs * (_asyncMetrics.requests - 1)) + elapsed) / _asyncMetrics.requests;
                return transformed;
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
                _asyncMetrics.failures += 1;
                warn(`fetchStore("${name}") failed: ${errorMessage}`);
                return null;
            }
        }
    };

    const promise = runFetch().finally(() => {
        delete _inflight[cacheSlot];
        if (_requestVersion[cacheSlot] === currentVersion) {
            delete _requestVersion[cacheSlot];
        }
        if (abortOnCleanup) _unregisterStoreCleanup(name, abortOnCleanup);
    });

    _inflight[cacheSlot] = { promise, transform };
    _fetchRegistry[name] = { url: urlOrPromise, options: { ...options, cacheKey } };

    return promise;
};

export const refetchStore = async (name: string): Promise<unknown> => {
    const last = _fetchRegistry[name];
    if (!last) {
        if (isDev()) {
            warn(
                `refetchStore("${name}") - no previous fetch found.\n` +
                `Call fetchStore("${name}", url) first.`
            );
        }
        return;
    }
    return fetchStore(name, last.url, last.options);
};

const _revalidateKeys = new Set<string>();
const _revalidateHandlers: Record<string, () => void> = {};

export const enableRevalidateOnFocus = (name?: string): (() => void) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const key = name ?? "*";
    if (_revalidateKeys.has(key)) return _revalidateHandlers[key] ?? (() => {});
    const handler = () => {
        if (key === "*") {
            Object.keys(_fetchRegistry).forEach((k) => { void refetchStore(k); });
        } else {
            void refetchStore(key);
        }
    };
    window.addEventListener("focus", handler);
    window.addEventListener("online", handler);
    _revalidateKeys.add(key);
    const cleanup = () => {
        window.removeEventListener("focus", handler);
        window.removeEventListener("online", handler);
        _revalidateKeys.delete(key);
        delete _revalidateHandlers[key];
        if (key !== "*") _unregisterStoreCleanup(key, cleanup);
    };
    _revalidateHandlers[key] = cleanup;
    if (key !== "*") _registerStoreCleanup(key, cleanup);
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

export const getAsyncMetrics = () => ({ ..._asyncMetrics });

export const _resetAsyncStateForTests = (): void => {
    Object.values(_revalidateHandlers).forEach((cleanup) => {
        try { cleanup(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(_cleanupSubs).forEach((unsubscribe) => {
        try { unsubscribe(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(_storeCleanupFns).forEach((fns) => {
        fns.forEach((fn) => {
            try { fn(); } catch (_) { /* ignore cleanup errors */ }
        });
    });

    Object.keys(_fetchRegistry).forEach((key) => delete _fetchRegistry[key]);
    Object.keys(_inflight).forEach((key) => delete _inflight[key]);
    Object.keys(_requestVersion).forEach((key) => delete _requestVersion[key]);
    Object.keys(_cacheMeta).forEach((key) => delete _cacheMeta[key]);
    Object.keys(_cleanupSubs).forEach((key) => delete _cleanupSubs[key]);
    Object.keys(_revalidateHandlers).forEach((key) => delete _revalidateHandlers[key]);
    Object.keys(_storeCleanupFns).forEach((key) => delete _storeCleanupFns[key]);

    _revalidateKeys.clear();
    _noSignalWarned.clear();

    _asyncMetrics.cacheHits = 0;
    _asyncMetrics.cacheMisses = 0;
    _asyncMetrics.dedupes = 0;
    _asyncMetrics.requests = 0;
    _asyncMetrics.failures = 0;
    _asyncMetrics.avgMs = 0;
    _asyncMetrics.lastMs = 0;
};
