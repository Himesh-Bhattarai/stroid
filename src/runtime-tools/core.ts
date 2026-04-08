/**
 * @module runtime-tools/core
 *
 * LAYER: Module
 * OWNS:  Base store/runtime inspection helpers without async or computed graph coupling.
 *
 * Consumers: runtime-tools index and public API.
 */
import { deepClone } from "../utils/clone.js";
import { cloneInspectable } from "../utils/inspectable-clone.js";
import { suggestStoreName } from "../internals/diagnostics.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    defaultRegistryScope,
    getActiveStoreRegistry,
} from "../core/store-registry.js";
import { subscribers } from "../core/store-lifecycle/registry.js";
import type { StoreFeatureMeta } from "../features/feature-registry.js";

const getRegistry = () => getActiveStoreRegistry(getStoreRegistry(defaultRegistryScope));

const exists = (name: string): boolean => {
    const registry = getRegistry();
    if (hasStoreEntry(registry, name)) return true;
    suggestStoreName(name, Object.keys(registry.stores));
    return false;
};

const matchesPattern = (name: string, pattern?: string): boolean => {
    if (!pattern) return true;
    if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return name.startsWith(prefix);
    }
    return name === pattern;
};

export const listStores = (pattern?: string): string[] => {
    const registry = getRegistry();
    return Object.keys(registry.stores).filter((name) => matchesPattern(name, pattern));
};

export const getStoreMeta = (name: string): StoreFeatureMeta | null => {
    if (!exists(name)) return null;
    const meta = getRegistry().metaEntries[name];
    return cloneInspectable(meta);
};

export const getInitialState = (): Record<string, unknown> =>
    deepClone(getRegistry().initialStates) as Record<string, unknown>;

export const getMetrics = (name: string): StoreFeatureMeta["metrics"] | null => {
    const meta = getRegistry().metaEntries[name];
    if (!meta?.metrics) return null;
    return cloneInspectable(meta.metrics);
};

export const getSubscriberCount = (name: string): number => {
    if (!exists(name)) return 0;
    return subscribers[name]?.size ?? 0;
};

export type ColdStoreReport = {
    name: string;
    createdAt: string;
    lastReadAt: string | null;
    updateCount: number;
    readCount: number;
    subscriberCount: number;
    ageMs: number;
    verdict: "cold" | "write-only" | "stale" | "active";
};

export const findColdStores = (options: {
    unreadThresholdMs?: number;
    includeWriteOnly?: boolean;
} = {}): ColdStoreReport[] => {
    const threshold = options.unreadThresholdMs ?? 60_000;
    const now = Date.now();
    return cloneInspectable(listStores().map((name) => {
        const meta = getRegistry().metaEntries[name];
        const createdAtMs = meta?.createdAt ? new Date(meta.createdAt).getTime() : now;
        const lastReadMs = meta?.lastReadAtMs ?? null;
        const ageMs = Math.max(0, now - createdAtMs);
        let verdict: ColdStoreReport["verdict"];

        if ((meta?.readCount ?? 0) === 0 && (meta?.updateCount ?? 0) === 0) {
            verdict = "cold";
        } else if ((meta?.readCount ?? 0) === 0) {
            verdict = "write-only";
        } else if (lastReadMs && (now - lastReadMs) > threshold) {
            verdict = "stale";
        } else {
            verdict = "active";
        }

        return {
            name,
            createdAt: meta?.createdAt ?? new Date(createdAtMs).toISOString(),
            lastReadAt: meta?.lastReadAt ?? null,
            updateCount: meta?.updateCount ?? 0,
            readCount: meta?.readCount ?? 0,
            subscriberCount: getSubscriberCount(name),
            ageMs,
            verdict,
        };
    }).filter((report) =>
        report.verdict === "cold"
        || report.verdict === "stale"
        || (options.includeWriteOnly && report.verdict === "write-only")
    ));
};

export { exists as runtimeToolStoreExists };
