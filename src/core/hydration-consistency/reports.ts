/**
 * @module hydration-consistency/reports
 *
 * LAYER: Store runtime
 * OWNS:  Read-side cloning helpers for hydration consistency state.
 *
 * Consumers: runtime-tools.
 */
import { cloneInspectable } from "../../utils/inspectable-clone.js";
import type { StoreRegistry } from "../store-registry.js";
import type {
    HydrationBootWindowMode,
    HydrationConsistencyMetrics,
    HydrationConsistencyStoreState,
    HydrationDriftEvent,
} from "./types.js";

export const getHydrationStoreState = (
    registry: StoreRegistry,
    store: string
): HydrationConsistencyStoreState | null => {
    const entry = registry.hydration.stores[store];
    if (!entry) return null;
    return cloneInspectable(entry);
};

export const getHydrationStoreStates = (
    registry: StoreRegistry
): HydrationConsistencyStoreState[] => Object
    .values(registry.hydration.stores)
    .map((entry) => cloneInspectable(entry));

export const getHydrationDriftEvents = (
    registry: StoreRegistry,
    limit?: number
): HydrationDriftEvent[] => {
    const events = registry.hydration.events;
    const slice = typeof limit === "number" && limit >= 0
        ? events.slice(Math.max(0, events.length - limit))
        : events;
    return slice.map((event) => cloneInspectable(event));
};

export const getHydrationMetrics = (
    registry: StoreRegistry
): HydrationConsistencyMetrics & {
    pendingWrites: number;
    bootWindowActive: boolean;
    bootWindowMode: HydrationBootWindowMode | null;
    bootWindowEndsAtMs: number | null;
    manualCloseAvailable: boolean;
} => cloneInspectable({
    ...registry.hydration.metrics,
    pendingWrites: registry.hydration.queue.length,
    bootWindowActive: registry.hydration.bootWindowActive,
    bootWindowMode: registry.hydration.bootWindowMode,
    bootWindowEndsAtMs: registry.hydration.bootWindowEndsAtMs,
    manualCloseAvailable: registry.hydration.bootWindowMode === "manual",
});
