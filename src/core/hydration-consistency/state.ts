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
    HydrationConsistencyOptions,
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
    bootWindowStartedAtMs: null,
    bootWindowEndsAtMs: null,
    bootWindowTimer: null,
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
    state.bootWindowStartedAtMs = null;
    state.bootWindowEndsAtMs = null;
    state.replaying = false;
    state.sequence = 0;
};

export const closeHydrationBootWindow = (state: HydrationRuntimeState): void => {
    if (state.bootWindowTimer) {
        clearTimeout(state.bootWindowTimer);
        state.bootWindowTimer = null;
    }
    state.bootWindowStartedAtMs = null;
    state.bootWindowEndsAtMs = null;
};

export const initializeHydrationConsistency = <Snapshot extends object>(
    registry: StoreRegistry,
    snapshot: Snapshot,
    consistency?: HydrationConsistencyOptions<Snapshot>
): void => {
    const state = registry.hydration;
    resetHydrationRuntimeState(state);
    if (!consistency) return;

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

    const bootWindowMs = Math.max(0, consistency.bootWindowMs ?? 0);
    if (bootWindowMs > 0 && typeof setTimeout === "function") {
        state.bootWindowStartedAtMs = hydratedAtMs;
        state.bootWindowEndsAtMs = hydratedAtMs + bootWindowMs;
        state.bootWindowTimer = setTimeout(() => {
            flushHydrationWriteQueue(registry);
        }, bootWindowMs);
    }
};

export const shouldQueueHydrationWrite = (
    registry: StoreRegistry,
    store: string,
    source: HydrationConsistencySource
): boolean => {
    const state = registry.hydration;
    if (state.replaying) return false;
    if (state.bootWindowEndsAtMs === null) return false;
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
