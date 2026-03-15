/**
 * @fileoverview src\async-registry.ts
 */
export type AsyncStateSnapshot = {
    data?: unknown;
    loading: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
    cached?: boolean;
    revalidating?: boolean;
};

export type AsyncStateAdapter = (ctx: {
    name: string;
    prev: unknown;
    next: AsyncStateSnapshot;
    set: (value: unknown | ((draft: any) => void)) => void;
}) => void;

export interface FetchOptions {
    transform?: (result: unknown) => unknown;
    onSuccess?: (data: unknown) => void;
    onError?: (message: string) => void;
    /**
     * Optional adapter to write async state into a custom store shape.
     * When provided, default AsyncState writes are skipped.
     */
    stateAdapter?: AsyncStateAdapter;
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
    ratePruneTimer: ReturnType<typeof setTimeout> | null;
    noSignalWarned: Set<string>;
    shapeWarned: Set<string>;
    autoCreateWarned: Set<string>;
    mutableResultWarned: Set<string>;
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
    ratePruneTimer: null,
    noSignalWarned: new Set<string>(),
    shapeWarned: new Set<string>(),
    autoCreateWarned: new Set<string>(),
    mutableResultWarned: new Set<string>(),
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
    registry.shapeWarned.clear();
    registry.autoCreateWarned.clear();
    registry.mutableResultWarned.clear();
    registry.ratePruneState.lastAt = 0;
    if (registry.ratePruneTimer) {
        clearTimeout(registry.ratePruneTimer);
        registry.ratePruneTimer = null;
    }

    registry.asyncMetrics.cacheHits = 0;
    registry.asyncMetrics.cacheMisses = 0;
    registry.asyncMetrics.dedupes = 0;
    registry.asyncMetrics.requests = 0;
    registry.asyncMetrics.failures = 0;
    registry.asyncMetrics.avgMs = 0;
    registry.asyncMetrics.lastMs = 0;
};

