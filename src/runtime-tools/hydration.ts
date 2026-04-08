/**
 * @module runtime-tools/hydration
 *
 * LAYER: Public API
 * OWNS:  Read-only hydration consistency inspection helpers.
 *
 * Consumers: runtime-tools index and public API.
 */
import {
    defaultRegistryScope,
    getActiveStoreRegistry,
    getStoreRegistry,
} from "../core/store-registry.js";
import {
    getHydrationDriftEvents as readHydrationDriftEvents,
    getHydrationMetrics as readHydrationMetrics,
    getHydrationStoreState,
    getHydrationStoreStates,
    type HydrationConsistencyMetrics,
    type HydrationConsistencyResolution,
    type HydrationConsistencyAuthority,
    type HydrationConsistencyPolicy,
    type HydrationConsistencySource,
    type HydrationBootWindowMode,
    type HydrationDriftEvent,
    type HydrationSnapshotMetadata,
} from "../core/hydration-consistency.js";

const getRegistry = () => getActiveStoreRegistry(getStoreRegistry(defaultRegistryScope));

export type HydrationConsistencyReport = HydrationSnapshotMetadata & {
    store: string;
    authority: HydrationConsistencyAuthority;
    policy: HydrationConsistencyPolicy;
    hydratedAt: string;
    hydratedAtMs: number;
    firstDivergedAt: string | null;
    firstDivergedAtMs: number | null;
    lastDivergedAt: string | null;
    lastDivergedAtMs: number | null;
    lastResolution: HydrationConsistencyResolution | null;
    lastSource: HydrationConsistencySource | null;
    driftCount: number;
    queuedWrites: number;
    replayedWrites: number;
    invalidatedAt: string | null;
    invalidatedAtMs: number | null;
    baselineHash: number;
    currentHash: number;
    baseline: unknown;
};

export type HydrationDriftMetrics = HydrationConsistencyMetrics & {
    pendingWrites: number;
    bootWindowActive: boolean;
    bootWindowMode: HydrationBootWindowMode | null;
    bootWindowEndsAtMs: number | null;
    manualCloseAvailable: boolean;
};

const toReport = (entry: ReturnType<typeof getHydrationStoreStates>[number]): HydrationConsistencyReport => ({
    store: entry.store,
    authority: entry.authority,
    policy: entry.policy,
    hydratedAt: entry.hydratedAt,
    hydratedAtMs: entry.hydratedAtMs,
    firstDivergedAt: entry.firstDivergedAt,
    firstDivergedAtMs: entry.firstDivergedAtMs,
    lastDivergedAt: entry.lastDivergedAt,
    lastDivergedAtMs: entry.lastDivergedAtMs,
    lastResolution: entry.lastResolution,
    lastSource: entry.lastSource,
    driftCount: entry.driftCount,
    queuedWrites: entry.queuedWrites,
    replayedWrites: entry.replayedWrites,
    invalidatedAt: entry.invalidatedAt,
    invalidatedAtMs: entry.invalidatedAtMs,
    baselineHash: entry.baselineHash,
    currentHash: entry.currentHash,
    baseline: entry.baseline,
    ...(entry.snapshotVersion !== undefined ? { snapshotVersion: entry.snapshotVersion } : {}),
    ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
    ...(entry.checksum !== undefined ? { checksum: entry.checksum } : {}),
    ...(entry.schemaSignature !== undefined ? { schemaSignature: entry.schemaSignature } : {}),
});

export const getHydrationConsistency = (name?: string): HydrationConsistencyReport | HydrationConsistencyReport[] | null => {
    if (typeof name === "string") {
        const entry = getHydrationStoreState(getRegistry(), name);
        if (!entry) return null;
        return toReport(entry);
    }
    return getHydrationStoreStates(getRegistry()).map(toReport);
};

export const getHydrationDriftEvents = (limit?: number): HydrationDriftEvent[] =>
    readHydrationDriftEvents(getRegistry(), limit);

export const getHydrationDriftMetrics = (): HydrationDriftMetrics =>
    readHydrationMetrics(getRegistry());
