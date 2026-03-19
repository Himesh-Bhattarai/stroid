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

const flushRegistry = (registry: StoreRegistry): void => {
    const state = registry.notify;
    state.isFlushing = true;
    state.flushId = (state.flushId + 1) >>> 0;
    const flushVersion = state.flushId;
    const plan = buildFlushPlan(state);

    const finish = (): void => {
        state.isFlushing = false;
        state.notifyScheduled = false;
        if (state.pendingNotifications.size > 0) scheduleFlush(registry);
    };

    deliverFlush(registry, plan, flushVersion, finish);
};

export const scheduleFlush = (registry: StoreRegistry): void => {
    scheduleFlushInternal(registry, flushRegistry);
};
