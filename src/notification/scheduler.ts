/**
 * @module notification/scheduler
 *
 * LAYER: Notification pipeline
 * OWNS:  Flush scheduling and chunk timers.
 *
 * Consumers: notification/index.ts, notification/delivery.ts
 */
import { runWithRegistry, type StoreRegistry } from "../core/store-registry.js";

export const scheduleChunk = (registry: StoreRegistry, fn: () => void, delayMs: number): void => {
    const run = () => runWithRegistry(registry, fn);
    if (delayMs > 0 && typeof setTimeout === "function") {
        setTimeout(run, delayMs);
        return;
    }
    if (typeof queueMicrotask === "function") {
        queueMicrotask(run);
        return;
    }
    Promise.resolve().then(run);
};

export const scheduleFlush = (registry: StoreRegistry, flush: (registry: StoreRegistry) => void): void => {
    const state = registry.notify;
    if (state.notifyScheduled) return;
    state.notifyScheduled = true;
    const run = () => runWithRegistry(registry, () => flush(registry));
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};
