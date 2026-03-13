export interface FetchOptions {
    transform?: (result: unknown) => unknown;
    onSuccess?: (data: unknown) => void;
    onError?: (message: string) => void;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    ttl?: number;
    staleWhileRevalidate?: boolean;
    dedupe?: boolean;
    retry?: number;
    retryDelay?: number;
    retryBackoff?: number;
    signal?: AbortSignal;
    cacheKey?: string;
    responseType?: "auto" | "json" | "text" | "arrayBuffer" | "blob" | "formData";
    /**
     * Auto-create the backing store if missing.
     * Defaults to the global config setting (true by default).
     */
    autoCreate?: boolean;
    /**
     * Clone strategy for transformed results.
     * - "none" (default): store by reference.
     * - "shallow": shallow clone objects/arrays.
     * - "deep": deep clone objects/arrays.
     */
    cloneResult?: "none" | "shallow" | "deep";
}

type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };

export type AsyncRegistry = {
    fetchRegistry: Record<string, { kind: "url"; url: string; options: FetchOptions } | { kind: "factory"; factory: () => string | Promise<unknown>; options: FetchOptions }>;
    inflight: Partial<Record<string, InflightEntry>>;
    requestVersion: Record<string, number>;
    cacheMeta: Record<string, { timestamp: number; expiresAt: number | null; data: unknown }>;
    rateWindowStart: Record<string, number>;
    rateCount: Record<string, number>;
    ratePruneState: { lastAt: number };
    noSignalWarned: Set<string>;
    autoCreateWarned: Set<string>;
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

export const createAsyncRegistry = (): AsyncRegistry => ({
    fetchRegistry: Object.create(null),
    inflight: Object.create(null),
    requestVersion: Object.create(null),
    cacheMeta: Object.create(null),
    rateWindowStart: Object.create(null),
    rateCount: Object.create(null),
    ratePruneState: { lastAt: 0 },
    noSignalWarned: new Set<string>(),
    autoCreateWarned: new Set<string>(),
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
});

export const resetAsyncRegistry = (registry: AsyncRegistry): void => {
    Object.values(registry.revalidateHandlers).forEach((cleanup) => {
        try { cleanup(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(registry.cleanupSubs).forEach((unsubscribe) => {
        try { unsubscribe(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(registry.storeCleanupFns).forEach((fns) => {
        fns.forEach((fn) => {
            try { fn(); } catch (_) { /* ignore cleanup errors */ }
        });
    });

    Object.keys(registry.fetchRegistry).forEach((key) => delete registry.fetchRegistry[key]);
    Object.keys(registry.inflight).forEach((key) => delete registry.inflight[key]);
    Object.keys(registry.requestVersion).forEach((key) => delete registry.requestVersion[key]);
    Object.keys(registry.cacheMeta).forEach((key) => delete registry.cacheMeta[key]);
    Object.keys(registry.rateWindowStart).forEach((key) => delete registry.rateWindowStart[key]);
    Object.keys(registry.rateCount).forEach((key) => delete registry.rateCount[key]);
    Object.keys(registry.cleanupSubs).forEach((key) => delete registry.cleanupSubs[key]);
    Object.keys(registry.storeCleanupFns).forEach((key) => delete registry.storeCleanupFns[key]);
    Object.keys(registry.revalidateHandlers).forEach((key) => delete registry.revalidateHandlers[key]);

    registry.revalidateKeys.clear();
    registry.noSignalWarned.clear();
    registry.autoCreateWarned.clear();
    registry.ratePruneState.lastAt = 0;

    registry.asyncMetrics.cacheHits = 0;
    registry.asyncMetrics.cacheMisses = 0;
    registry.asyncMetrics.dedupes = 0;
    registry.asyncMetrics.requests = 0;
    registry.asyncMetrics.failures = 0;
    registry.asyncMetrics.avgMs = 0;
    registry.asyncMetrics.lastMs = 0;
};
