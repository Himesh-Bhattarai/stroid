import { createStore, setStore, hasStore } from "./store.js";
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
};

const _fetchRegistry: Record<string, { url: string | Promise<unknown>; options: FetchOptions }> = {};
const _inflight: Partial<Record<string, Promise<unknown>>> = {};
const _requestVersion: Record<string, number> = {};
const _cacheMeta: Record<string, { timestamp: number; data: unknown }> = {};
const _noSignalWarned = new Set<string>();

const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

const shouldUseCache = (name: string, ttl?: number): boolean => {
    if (!ttl) return false;
    const meta = _cacheMeta[name];
    if (!meta) return false;
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

    if (!hasStore(name)) {
        createStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        });
    }

    if (shouldUseCache(cacheSlot, ttl)) {
        _asyncMetrics.cacheHits += 1;
        const cached = _cacheMeta[cacheSlot].data;
        setStore(name, {
            data: cached,
            loading: false,
            error: null,
            status: "success",
            cached: true,
        });
        if (!staleWhileRevalidate) return cached;
    } else {
        _asyncMetrics.cacheMisses += 1;
    }

    if (dedupe && _inflight[cacheSlot]) {
        _asyncMetrics.dedupes += 1;
        return _inflight[cacheSlot]!;
    }

    const currentVersion = (_requestVersion[cacheSlot] ?? 0) + 1;
    _requestVersion[cacheSlot] = currentVersion;

    setStore(name, {
        loading: true,
        error: null,
        status: "loading",
    });

    _asyncMetrics.requests += 1;
    const startedAt = Date.now();

    const controller = !signal && typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
    const mergedSignal = signal || controller?.signal;

    const runFetch = async (): Promise<unknown> => {
        let attempts = 0;
        let delayMs = retryDelay ?? 400;
        while (true) {
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

                const transformed = transform ? transform(result) : result;

                if (_requestVersion[cacheSlot] !== currentVersion) {
                    return null; // stale, ignore
                }

                _cacheMeta[cacheSlot] = { timestamp: Date.now(), data: transformed };

                setStore(name, {
                    data: transformed,
                    loading: false,
                    error: null,
                    status: "success",
                });

                onSuccess?.(transformed);
                const elapsed = Date.now() - startedAt;
                _asyncMetrics.lastMs = elapsed;
                _asyncMetrics.avgMs = ((_asyncMetrics.avgMs * (_asyncMetrics.requests - 1)) + elapsed) / _asyncMetrics.requests;
                return transformed;
            } catch (err) {
                attempts += 1;
                const isAbort = (err as any)?.name === "AbortError";
                if (isAbort) {
                    warn(`fetchStore("${name}") aborted`);
                    setStore(name, {
                        loading: false,
                        error: "aborted",
                        status: "aborted",
                    });
                    return null;
                }

                if (attempts <= (retry ?? 0)) {
                    await delay(delayMs);
                    delayMs *= retryBackoff ?? 1.7;
                    continue;
                }

                if (_requestVersion[cacheSlot] !== currentVersion) return null;

                const errorMessage = (err as any)?.message || "Something went wrong";
                setStore(name, {
                    data: null,
                    loading: false,
                    error: errorMessage,
                    status: "error",
                });

                onError?.(errorMessage);
                _asyncMetrics.failures += 1;
                warn(`fetchStore("${name}") failed: ${errorMessage}`);
                return null;
            }
        }
    };

    const promise = runFetch().finally(() => {
        delete _inflight[cacheSlot];
    });

    _inflight[cacheSlot] = promise;
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

export const enableRevalidateOnFocus = (name?: string): (() => void) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const key = name ?? "*";
    if (_revalidateKeys.has(key)) return () => {};
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
    return () => {
        window.removeEventListener("focus", handler);
        window.removeEventListener("online", handler);
        _revalidateKeys.delete(key);
    };
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
