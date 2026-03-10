import { createStore, setStore, hasStore, _subscribe } from "./store.js";
import { error, warn, isDev } from "./utils.js";
import { normalizeStoreRegistryScope } from "./store-registry.js";
import { getConfig } from "./internals/config.js";

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
export type FetchInput = string | Promise<unknown> | (() => string | Promise<unknown>);

type AsyncState = {
    data: unknown;
    loading: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
    cached?: boolean;
    revalidating?: boolean;
};

type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };
type AsyncRegistry = {
    fetchRegistry: Record<string, { kind: "url"; url: string; options: FetchOptions } | { kind: "factory"; factory: () => string | Promise<unknown>; options: FetchOptions }>;
    inflight: Partial<Record<string, InflightEntry>>;
    requestVersion: Record<string, number>;
    cacheMeta: Record<string, { timestamp: number; expiresAt: number | null; data: unknown }>;
    noSignalWarned: Set<string>;
    cleanupSubs: Record<string, () => void>;
    storeCleanupFns: Record<string, Set<() => void>>;
    revalidateKeys: Set<string>;
    revalidateHandlers: Record<string, () => void>;
    asyncMetrics: {
        cacheHits: number;
        cacheMisses: number;
        dedupes: number;
        requests: number;
        failures: number;
        avgMs: number;
        lastMs: number;
    };
};

const _asyncRegistries = new Map<string, AsyncRegistry>();
const _scope = normalizeStoreRegistryScope(new URL("./store.js", import.meta.url).href);

const getAsyncRegistry = (scope: string): AsyncRegistry => {
    const existing = _asyncRegistries.get(scope);
    if (existing) return existing;
    const created: AsyncRegistry = {
        fetchRegistry: Object.create(null),
        inflight: Object.create(null),
        requestVersion: Object.create(null),
        cacheMeta: Object.create(null),
        noSignalWarned: new Set<string>(),
        cleanupSubs: Object.create(null),
        storeCleanupFns: Object.create(null),
        revalidateKeys: new Set<string>(),
        revalidateHandlers: Object.create(null),
        asyncMetrics: {
            cacheHits: 0,
            cacheMisses: 0,
            dedupes: 0,
            requests: 0,
            failures: 0,
            avgMs: 0,
            lastMs: 0,
        },
    };
    _asyncRegistries.set(scope, created);
    return created;
};

const _asyncRegistry = getAsyncRegistry(_scope);
const _fetchRegistry = _asyncRegistry.fetchRegistry;
const _inflight = _asyncRegistry.inflight;
const _requestVersion = _asyncRegistry.requestVersion;
const _cacheMeta = _asyncRegistry.cacheMeta;
const _noSignalWarned = _asyncRegistry.noSignalWarned;
const _cleanupSubs = _asyncRegistry.cleanupSubs;
const _storeCleanupFns = _asyncRegistry.storeCleanupFns;
const _revalidateKeys = _asyncRegistry.revalidateKeys;
const _revalidateHandlers = _asyncRegistry.revalidateHandlers;
const _asyncMetrics = _asyncRegistry.asyncMetrics;
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
    } = options;

    if (!signal && isDev() && !_noSignalWarned.has(name)) {
        _noSignalWarned.add(name);
        warn(
            `fetchStore("${name}") called without an AbortSignal. Provide "signal" to enable cancellation (recommended).`
        );
    }

    const cacheSlot = cacheKey ? `${name}:${cacheKey}` : name;
    const retryPolicy = _normalizeRetryOptions(name, retry, retryDelay, retryBackoff);
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
        _asyncMetrics.dedupes += 1;
        if (!transform || active.transform === transform) return active.promise;
        return active.raw.then((raw) => transform(raw));
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
                    const contentType = response.headers.get("content-type") || "";
                    if (contentType.includes("application/json")) {
                        result = await response.json();
                    } else {
                        result = await response.text();
                    }
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
                _asyncMetrics.failures += 1;
                warn(`fetchStore("${name}") failed: ${errorMessage}`);
                return null;
            }
        }
    };

    const execution = executeFetch();
    const promise = execution.then((res) => res?.transformed ?? null).finally(() => {
        delete _inflight[cacheSlot];
        if (_requestVersion[cacheSlot] === currentVersion) {
            delete _requestVersion[cacheSlot];
        }
        if (abortOnCleanup) _unregisterStoreCleanup(name, abortOnCleanup);
    });
    const rawPromise = execution.then((res) => res?.raw);

    _inflight[cacheSlot] = { promise, raw: rawPromise, transform };
    if (typeof urlOrRequest === "function") {
        _fetchRegistry[name] = { kind: "factory", factory: urlOrRequest, options: { ...options, cacheKey } };
    } else if (typeof urlOrRequest === "string") {
        _fetchRegistry[name] = { kind: "url", url: urlOrRequest, options: { ...options, cacheKey } };
    } else {
        delete _fetchRegistry[name];
    }

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
    if (last.kind === "factory") {
        return fetchStore(name, last.factory, last.options);
    }
    return fetchStore(name, last.url, last.options);
};

export const enableRevalidateOnFocus = (name?: string, overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }): (() => void) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const key = name ?? "*";
    if (_revalidateKeys.has(key)) return _revalidateHandlers[key] ?? (() => {});
    const focusConfig = getConfig().revalidateOnFocus;
    const debounceMs = Math.max(0, overrides?.debounceMs ?? focusConfig.debounceMs);
    const maxConcurrent = Math.max(1, overrides?.maxConcurrent ?? focusConfig.maxConcurrent);
    const staggerMs = Math.max(0, overrides?.staggerMs ?? focusConfig.staggerMs);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const runRefetch = () => {
        let targets = key === "*" ? Object.keys(_fetchRegistry) : [key];
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
                const delay = staggerMs > 0 ? staggerMs * Math.max(1, batch.length) : 0;
                setTimeout(launchNext, delay);
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
    _revalidateKeys.add(key);
    const cleanup = () => {
        window.removeEventListener("focus", handler);
        window.removeEventListener("online", handler);
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
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
