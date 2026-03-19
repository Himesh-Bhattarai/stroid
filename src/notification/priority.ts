/**
 * @module notification/priority
 *
 * LAYER: Notification pipeline
 * OWNS:  Flush ordering and priority sorting.
 *
 * Consumers: notification/index.ts
 */
import { getConfig } from "../internals/config.js";
import { getComputedOrder } from "../internals/computed-order.js";
import type { NotifyState } from "../core/store-registry.js";

export type FlushPlan = {
    names: string[];
    sliceSize: number;
    chunkDelayMs: number;
    runInline: boolean;
    prioritySet: Set<string> | null;
};

export const buildFlushPlan = (state: NotifyState): FlushPlan => {
    const { pendingNotifications, pendingBuffer, orderedNames } = state;
    const cfg = getConfig().flush;
    const priority = cfg.priorityStores || [];
    const prioritySet = priority.length ? new Set(priority) : null;

    orderedNames.length = 0;
    pendingBuffer.length = 0;
    const pendingSet = new Set<string>();
    if (prioritySet) {
        for (const name of pendingNotifications) {
            pendingBuffer.push(name);
            pendingSet.add(name);
        }
        for (const p of priority) {
            if (pendingSet.has(p)) orderedNames.push(p);
        }
        for (const name of pendingBuffer) {
            if (!prioritySet.has(name)) orderedNames.push(name);
        }
    } else {
        for (const name of pendingNotifications) {
            pendingBuffer.push(name);
            pendingSet.add(name);
            orderedNames.push(name);
        }
    }
    pendingNotifications.clear();

    const computedOrder = getComputedOrder(orderedNames);
    const orderedSet = new Set(orderedNames);
    for (const computedName of computedOrder) {
        if (!orderedSet.has(computedName)) {
            orderedNames.push(computedName);
            orderedSet.add(computedName);
        }
    }

    const sliceSize = Number.isFinite(cfg.chunkSize) && (cfg.chunkSize as number) > 0
        ? (cfg.chunkSize as number)
        : Number.POSITIVE_INFINITY;
    const chunkDelayMs = cfg.chunkDelayMs;
    const runInline = sliceSize === Number.POSITIVE_INFINITY && chunkDelayMs === 0;
    const names = orderedNames;
    return { names, sliceSize, chunkDelayMs, runInline, prioritySet };
};
