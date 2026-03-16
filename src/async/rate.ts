/**
 * @module async/rate
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/rate.
 *
 * Consumers: Internal imports and public API.
 */
import { getActiveAsyncRegistry, getRateCountRegistry, getRateWindowStartRegistry } from "../async-cache.js";
import type { AsyncRegistry } from "../async-registry.js";

export const RATE_WINDOW_MS = 1000;
export const RATE_MAX = 100;

const pruneRateCountersForRegistry = (registry: AsyncRegistry, nowTs: number): void => {
    if (nowTs - registry.ratePruneState.lastAt < RATE_WINDOW_MS) return;
    registry.ratePruneState.lastAt = nowTs;
    Object.keys(registry.rateWindowStart).forEach((key) => {
        if (nowTs - (registry.rateWindowStart[key] ?? 0) > RATE_WINDOW_MS) {
            delete registry.rateWindowStart[key];
            delete registry.rateCount[key];
        }
    });
};

export const pruneRateCounters = (nowTs: number): void => {
    pruneRateCountersForRegistry(getActiveAsyncRegistry(), nowTs);
};

export const scheduleRatePrune = (delayMs = RATE_WINDOW_MS): void => {
    const registry = getActiveAsyncRegistry();
    if (registry.ratePruneTimer) return;
    if (typeof setTimeout !== "function") return;
    registry.ratePruneTimer = setTimeout(() => {
        registry.ratePruneTimer = null;
        pruneRateCountersForRegistry(registry, Date.now());
    }, delayMs);
};

export const registerRateHit = (cacheSlot: string, nowTs: number): boolean => {
    const rateWindowStart = getRateWindowStartRegistry();
    const rateCount = getRateCountRegistry();
    const windowStart = rateWindowStart[cacheSlot];
    const currentCount = rateCount[cacheSlot] ?? 0;
    if (windowStart !== undefined && nowTs - windowStart < RATE_WINDOW_MS) {
        if (currentCount >= RATE_MAX) {
            return true;
        }
        rateCount[cacheSlot] = currentCount + 1;
        return false;
    }

    rateWindowStart[cacheSlot] = nowTs;
    rateCount[cacheSlot] = 1;
    return false;
};


