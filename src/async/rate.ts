import { rateCount, ratePruneState, rateWindowStart } from "../async-cache.js";

export const RATE_WINDOW_MS = 1000;
export const RATE_MAX = 100;

export const pruneRateCounters = (nowTs: number): void => {
    if (nowTs - ratePruneState.lastAt < RATE_WINDOW_MS) return;
    ratePruneState.lastAt = nowTs;
    Object.keys(rateWindowStart).forEach((key) => {
        if (nowTs - (rateWindowStart[key] ?? 0) > RATE_WINDOW_MS) {
            delete rateWindowStart[key];
            delete rateCount[key];
        }
    });
};

export const registerRateHit = (cacheSlot: string, nowTs: number): boolean => {
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
