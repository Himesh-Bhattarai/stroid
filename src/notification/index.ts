/**
 * @module notification/index
 *
 * LAYER: Notification pipeline
 * OWNS:  Orchestrating flush scheduling without owning sub-responsibilities.
 *
 * Consumers: store-notify.ts
 */
import type { StoreRegistry } from "../core/store-registry.js";
import { buildFlushPlan } from "./priority.js";
import { deliverFlush } from "./delivery.js";
import { scheduleFlush as scheduleFlushInternal } from "./scheduler.js";

const flushRegistry = (registry: StoreRegistry, options: { inline: boolean }): void => {
    const state = registry.notify;
    state.isFlushing = true;
    state.flushId = (state.flushId + 1) >>> 0;
    const flushVersion = state.flushId;
    const basePlan = buildFlushPlan(state);
    const plan = options.inline
        ? {
            ...basePlan,
            runInline: true,
            sliceSize: Number.POSITIVE_INFINITY,
            chunkDelayMs: 0,
        }
        : basePlan;

    const finish = (): void => {
        state.isFlushing = false;
        state.notifyScheduled = false;
        if (!options.inline && state.pendingNotifications.size > 0) scheduleFlush(registry);
    };

    deliverFlush(registry, plan, flushVersion, finish);
};

export const scheduleFlush = (registry: StoreRegistry): void => {
    scheduleFlushInternal(registry, (activeRegistry) => {
        flushRegistry(activeRegistry, { inline: false });
    });
};

export const flushPendingNotificationsInline = (registry: StoreRegistry): void => {
    const state = registry.notify;
    if (state.batchDepth > 0) return;

    let passes = 0;
    while ((state.notifyScheduled || state.pendingNotifications.size > 0) && !state.isFlushing) {
        flushRegistry(registry, { inline: true });
        passes += 1;
        if (passes > 10000) {
            throw new Error("flushPendingNotificationsInline exceeded safety pass limit.");
        }
    }
};

const scheduleIdleCheck = (fn: () => void): void => {
    if (typeof setTimeout === "function") {
        setTimeout(fn, 0);
        return;
    }
    if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
        return;
    }
    Promise.resolve().then(fn);
};

export const waitForNotificationIdle = (registry: StoreRegistry): Promise<void> =>
    new Promise((resolve, reject) => {
        const maxChecks = 20000;
        let checks = 0;

        const check = (): void => {
            try {
                flushPendingNotificationsInline(registry);
            } catch (error) {
                reject(error);
                return;
            }

            const state = registry.notify;
            if (!state.isFlushing && !state.notifyScheduled && state.pendingNotifications.size === 0) {
                resolve();
                return;
            }

            checks += 1;
            if (checks > maxChecks) {
                reject(new Error("waitForNotificationIdle exceeded safety check limit."));
                return;
            }

            scheduleIdleCheck(check);
        };

        check();
    });
