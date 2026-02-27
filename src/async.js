import { createStore, setStore, hasStore, getStore } from "./store.js";
import { error, warn } from "./utils.js";

const _fetchRegistry = {};   // last fetch config per store
const _inflight = {};        // in-flight promise per store
const _cacheMeta = {};       // { timestamp, data }
const _asyncMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    dedupes: 0,
    requests: 0,
    failures: 0,
    avgMs: 0,
    lastMs: 0,
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const shouldUseCache = (name, ttl) => {
    if (!ttl) return false;
    const meta = _cacheMeta[name];
    if (!meta) return false;
    return Date.now() - meta.timestamp < ttl;
};

export const fetchStore = async (name, urlOrPromise, options = {}) => {
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
        ttl,                    // ms
        staleWhileRevalidate = false,
        dedupe = true,
        retry = 0,
        retryDelay = 400,
        retryBackoff = 1.7,
        signal,
        cacheKey,               // optional key to vary cache per input
    } = options;

    const cacheSlot = cacheKey ? `${name}:${cacheKey}` : name;

    // create store if missing
    if (!hasStore(name)) {
        createStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        });
    }

    // serve from cache if still fresh
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
        // if SWR, continue to fetch in background
    }
    else {
        _asyncMetrics.cacheMisses += 1;
    }

    // dedupe in-flight
    if (dedupe && _inflight[cacheSlot]) {
        _asyncMetrics.dedupes += 1;
        return _inflight[cacheSlot];
    }

    // set loading state
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

    const runFetch = async () => {
        let attempts = 0;
        let delayMs = retryDelay;
        while (true) {
            try {
                let result;

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
                }
                else if (typeof urlOrPromise === "object" && typeof urlOrPromise.then === "function") {
                    result = await urlOrPromise;
                }
                else {
                    error(
                        `fetchStore("${name}") - second argument must be a URL string or Promise.\n` +
                        `Examples:\n` +
                        `  fetchStore("users", "https://api.example.com/users")\n` +
                        `  fetchStore("users", axios.get("/users"))`
                    );
                    return null;
                }

                const transformed = transform ? transform(result) : result;

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
                const isAbort = err?.name === "AbortError";
                if (isAbort) {
                    warn(`fetchStore("${name}") aborted`);
                    setStore(name, {
                        loading: false,
                        error: "aborted",
                        status: "aborted",
                    });
                    return null;
                }

                if (attempts <= retry) {
                    await delay(delayMs);
                    delayMs *= retryBackoff;
                    continue;
                }

                const errorMessage = err?.message || "Something went wrong";
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

export const refetchStore = async (name) => {
    const last = _fetchRegistry[name];
    if (!last) {
        warn(
            `refetchStore("${name}") - no previous fetch found.\n` +
            `Call fetchStore("${name}", url) first.`
        );
        return;
    }
    return fetchStore(name, last.url, last.options);
};

export const getAsyncMetrics = () => ({ ..._asyncMetrics });

const _buildFetchOptions = (options) => {
    const fetchOpts = {};

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
