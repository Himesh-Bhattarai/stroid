/**
 * @module hydration-consistency/reports
 *
 * LAYER: Store runtime
 * OWNS:  Read-side cloning helpers for hydration consistency state.
 *
 * Consumers: runtime-tools.
 */
import { deepClone } from "../../utils.js";
import type { StoreRegistry } from "../store-registry.js";
import type {
    HydrationConsistencyMetrics,
    HydrationConsistencyStoreState,
    HydrationDriftEvent,
} from "./types.js";

export const getHydrationStoreState = (
    registry: StoreRegistry,
    store: string
): HydrationConsistencyStoreState | null => registry.hydration.stores[store] ?? null;

export const getHydrationStoreStates = (
    registry: StoreRegistry
): HydrationConsistencyStoreState[] => Object.values(registry.hydration.stores).map((entry) => ({
    ...entry,
    baseline: deepClone(entry.baseline),
}));

export const getHydrationDriftEvents = (
    registry: StoreRegistry,
    limit?: number
): HydrationDriftEvent[] => {
    const events = registry.hydration.events;
    const slice = typeof limit === "number" && limit >= 0
        ? events.slice(Math.max(0, events.length - limit))
        : events;
    return slice.map((event) => ({
        ...event,
        metadata: { ...event.metadata },
        baseline: deepClone(event.baseline),
        live: deepClone(event.live),
        resolved: deepClone(event.resolved),
    }));
};

export const getHydrationMetrics = (
    registry: StoreRegistry
): HydrationConsistencyMetrics & {
    pendingWrites: number;
    bootWindowActive: boolean;
    bootWindowEndsAtMs: number | null;
} => ({
    ...registry.hydration.metrics,
    pendingWrites: registry.hydration.queue.length,
    bootWindowActive: registry.hydration.bootWindowEndsAtMs !== null,
    bootWindowEndsAtMs: registry.hydration.bootWindowEndsAtMs,
});
