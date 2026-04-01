/**
 * @module hydration-consistency/state
 *
 * LAYER: Store runtime
 * OWNS:  Hydration consistency state lifecycle and deferred write queue management.
 *
 * Consumers: store-registry and write paths.
 */
import { deepClone, hashState } from "../../utils.js";
import type { StoreRegistry } from "../store-registry.js";
import { DEFAULT_DEFER_SOURCES, DEFAULT_MAX_EVENTS } from "./constants.js";
import {
    nextHydrationSequence,
    resolveHydrationAuthority,
    resolveHydrationPolicy,
} from "./helpers.js";
import type {
    HydrationBootWindowControl,
    HydrationConsistencyOptions,
    HydrationBootWindowOptions,
    HydrationConsistencySource,
    HydrationConsistencyStorePolicy,
    HydrationRuntimeState,
} from "./types.js";

export const createHydrationRuntimeState = (): HydrationRuntimeState => ({
    stores: Object.create(null),
    events: [],
    metrics: {
        driftEvents: 0,
        queuedWrites: 0,
        replayedWrites: 0,
        reconciliations: 0,
        invalidations: 0,
    },
    queue: [],
    onDrift: null,
    maxEvents: DEFAULT_MAX_EVENTS,
    deferSources: new Set(DEFAULT_DEFER_SOURCES),
    bootWindowMode: null,
    bootWindowActive: false,
    bootWindowStartedAtMs: null,
    bootWindowEndsAtMs: null,
    bootWindowTimer: null,
    bootWindowToken: null,
    replaying: false,
    sequence: 0,
});

export const resetHydrationRuntimeState = (state: HydrationRuntimeState): void => {
    if (state.bootWindowTimer) {
        clearTimeout(state.bootWindowTimer);
        state.bootWindowTimer = null;
    }
    Object.keys(state.stores).forEach((key) => delete state.stores[key]);
    state.events.length = 0;
    state.queue.length = 0;
    state.metrics.driftEvents = 0;
    state.metrics.queuedWrites = 0;
    state.metrics.replayedWrites = 0;
    state.metrics.reconciliations = 0;
    state.metrics.invalidations = 0;
    state.onDrift = null;
    state.maxEvents = DEFAULT_MAX_EVENTS;
    state.deferSources = new Set(DEFAULT_DEFER_SOURCES);
    state.bootWindowMode = null;
    state.bootWindowActive = false;
    state.bootWindowStartedAtMs = null;
    state.bootWindowEndsAtMs = null;
    state.bootWindowToken = null;
    state.replaying = false;
    state.sequence = 0;
};

export const closeHydrationBootWindow = (state: HydrationRuntimeState): void => {
    if (state.bootWindowTimer) {
        clearTimeout(state.bootWindowTimer);
        state.bootWindowTimer = null;
    }
    state.bootWindowActive = false;
    state.bootWindowEndsAtMs = null;
};

const resolveBootWindowSettings = (
    consistency: Pick<HydrationConsistencyOptions, "bootWindow" | "bootWindowMs"> | undefined
): {
    mode: "timer" | "manual" | null;
    durationMs: number | null;
} => {
    if (!consistency) {
        return {
            mode: null,
            durationMs: null,
        };
    }
    const bootWindow = consistency.bootWindow;
    if (bootWindow === undefined) {
        const bootWindowMs = Math.max(0, consistency.bootWindowMs ?? 0);
        return {
            mode: bootWindowMs > 0 ? "timer" : null,
            durationMs: bootWindowMs > 0 ? bootWindowMs : null,
        };
    }
    const config: Exclude<HydrationBootWindowOptions, "timer" | "manual"> =
        typeof bootWindow === "string"
            ? { mode: bootWindow }
            : bootWindow;
    if (config.mode === "manual") {
        const fallbackMs = typeof config.fallbackMs === "number"
            ? Math.max(0, config.fallbackMs)
            : null;
        return {
            mode: "manual",
            durationMs: fallbackMs !== null && fallbackMs > 0 ? fallbackMs : null,
        };
    }
    const durationMs = Math.max(
        0,
        config.ms
        ?? consistency.bootWindowMs
        ?? 0
    );
    return {
        mode: durationMs > 0 ? "timer" : null,
        durationMs: durationMs > 0 ? durationMs : null,
    };
};

export const getHydrationBootWindowControl = (
    registry: StoreRegistry
): HydrationBootWindowControl | null => {
    const state = registry.hydration;
    const mode = state.bootWindowMode;
    const token = state.bootWindowToken;
    if (!mode || token === null) return null;
    return {
        mode,
        get startedAtMs() {
            return state.bootWindowToken === token
                ? state.bootWindowStartedAtMs
                : null;
        },
        get endsAtMs() {
            return state.bootWindowToken === token
                ? state.bootWindowEndsAtMs
                : null;
        },
        close: () => {
            if (state.bootWindowToken !== token) return;
            flushHydrationWriteQueue(registry);
        },
        isActive: () => state.bootWindowToken === token && state.bootWindowActive,
    };
};

export const initializeHydrationConsistency = <Snapshot extends object>(
    registry: StoreRegistry,
    snapshot: Snapshot,
    consistency?: HydrationConsistencyOptions<Snapshot>
): HydrationBootWindowControl | null => {
    const state = registry.hydration;
    resetHydrationRuntimeState(state);
    if (!consistency) return null;

    state.onDrift = consistency.onDrift as HydrationRuntimeState["onDrift"];
    state.maxEvents = Math.max(1, consistency.maxEvents ?? DEFAULT_MAX_EVENTS);
    state.deferSources = new Set(consistency.deferSources ?? DEFAULT_DEFER_SOURCES);

    const contract = consistency.contract;
    const policyMap = (consistency.policyMap ?? {}) as NonNullable<
        HydrationConsistencyOptions<Snapshot>["policyMap"]
    >;
    const hydratedAtMs = Date.now();
    const hydratedAt = new Date(hydratedAtMs).toISOString();

    Object.entries(snapshot).forEach(([store, value]) => {
        const storeContract = contract?.stores?.[store as keyof Snapshot & string];
        const authority = resolveHydrationAuthority(storeContract, contract);
        const policy = resolveHydrationPolicy(
            policyMap[store as keyof Snapshot & string] as HydrationConsistencyStorePolicy | undefined,
            authority
        );
        const baseline = deepClone(value);
        const baselineHash = hashState(baseline);
        state.stores[store] = {
            store,
            authority,
            policy: policy.policy,
            baseline,
            baselineHash,
            hydratedAt,
            hydratedAtMs,
            firstDivergedAt: null,
            firstDivergedAtMs: null,
            lastDivergedAt: null,
            lastDivergedAtMs: null,
            lastResolution: "stable",
            lastSource: "hydrate",
            driftCount: 0,
            queuedWrites: 0,
            replayedWrites: 0,
            invalidatedAt: null,
            invalidatedAtMs: null,
            currentHash: baselineHash,
            merge: policy.merge,
            onInvalidate: policy.onInvalidate,
            snapshotVersion: storeContract?.snapshotVersion ?? contract?.snapshotVersion,
            timestamp: storeContract?.timestamp ?? contract?.timestamp,
            checksum: storeContract?.checksum ?? contract?.checksum,
            schemaSignature: storeContract?.schemaSignature ?? contract?.schemaSignature,
        };
    });

    const resolvedBootWindow = resolveBootWindowSettings(consistency);
    if (!resolvedBootWindow.mode) {
        return null;
    }
    state.bootWindowMode = resolvedBootWindow.mode;
    state.bootWindowActive = true;
    state.bootWindowStartedAtMs = hydratedAtMs;
    state.bootWindowEndsAtMs = resolvedBootWindow.durationMs !== null
        ? hydratedAtMs + resolvedBootWindow.durationMs
        : null;
    state.bootWindowToken = nextHydrationSequence(state);
    if (resolvedBootWindow.durationMs !== null && typeof setTimeout === "function") {
        state.bootWindowTimer = setTimeout(() => {
            flushHydrationWriteQueue(registry);
        }, resolvedBootWindow.durationMs);
    }
    return getHydrationBootWindowControl(registry);
};

export const shouldQueueHydrationWrite = (
    registry: StoreRegistry,
    store: string,
    source: HydrationConsistencySource
): boolean => {
    const state = registry.hydration;
    if (state.replaying) return false;
    if (!state.bootWindowActive) return false;
    if (!state.deferSources.has(source)) return false;
    return !!state.stores[store];
};

export const enqueueHydrationWrite = (
    registry: StoreRegistry,
    store: string,
    source: HydrationConsistencySource,
    apply: () => void
): void => {
    const state = registry.hydration;
    state.queue.push({
        id: nextHydrationSequence(state),
        store,
        source,
        enqueuedAtMs: Date.now(),
        apply,
    });
    state.metrics.queuedWrites += 1;
    const entry = state.stores[store];
    if (entry) {
        entry.queuedWrites += 1;
        entry.lastSource = source;
    }
};

export const flushHydrationWriteQueue = (registry: StoreRegistry): void => {
    const state = registry.hydration;
    closeHydrationBootWindow(state);
    if (state.replaying || state.queue.length === 0) return;
    state.replaying = true;
    try {
        while (state.queue.length > 0) {
            const next = state.queue.shift();
            if (!next) continue;
            state.metrics.replayedWrites += 1;
            const entry = state.stores[next.store];
            if (entry) {
                entry.replayedWrites += 1;
                entry.lastSource = next.source;
            }
            next.apply();
        }
    } finally {
        state.replaying = false;
    }
};
