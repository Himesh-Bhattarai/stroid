/**
 * @module notification/scheduler
 *
 * LAYER: Notification pipeline
 * OWNS:  Flush scheduling and chunk timers.
 *
 * Consumers: notification/index.ts, notification/delivery.ts
 */
import { runWithRegistry, type StoreRegistry } from "../store-registry.js";

export const scheduleChunk = (fn: () => void, delayMs: number): void => {
    if (delayMs > 0 && typeof setTimeout === "function") {
        setTimeout(fn, delayMs);
        return;
    }
    if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
        return;
    }
    Promise.resolve().then(fn);
};

export const scheduleFlush = (registry: StoreRegistry, flush: (registry: StoreRegistry) => void): void => {
    const state = registry.notify;
    if (state.notifyScheduled) return;
    state.notifyScheduled = true;
    const run = () => runWithRegistry(registry, () => flush(registry));
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};
