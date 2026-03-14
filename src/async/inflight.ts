import { asyncMetrics, inflight, requestVersion } from "../async-cache.js";
import type { FetchOptions } from "../async-cache.js";
import { reportAsyncUsageError } from "./errors.js";

export type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };

export const isCurrentRequest = (cacheSlot: string, version: number): boolean =>
    (requestVersion[cacheSlot] ?? 0) === version;

export const reserveRequestVersion = (cacheSlot: string): number => {
    const currentVersion = (requestVersion[cacheSlot] ?? 0) + 1;
    requestVersion[cacheSlot] = currentVersion;
    return currentVersion;
};

export const clearRequestVersion = (cacheSlot: string, version: number): void => {
    if (requestVersion[cacheSlot] === version) delete requestVersion[cacheSlot];
};

export const setInflightEntry = (cacheSlot: string, entry: InflightEntry): void => {
    (inflight as Record<string, InflightEntry>)[cacheSlot] = entry;
};

export const clearInflightEntry = (cacheSlot: string): void => {
    delete inflight[cacheSlot];
};

export const hasInflightEntry = (cacheSlot: string): boolean => Boolean(inflight[cacheSlot]);

export const tryDedupeRequest = (
    name: string,
    cacheSlot: string,
    transform: FetchOptions["transform"] | undefined,
    onError?: (message: string) => void
): Promise<unknown> | null | undefined => {
    const active = inflight[cacheSlot] as InflightEntry | undefined;
    if (!active) return undefined;

    asyncMetrics.dedupes += 1;
    if (transform && active.transform && active.transform !== transform) {
        reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot dedupe callers that use different transform functions for cacheSlot "${cacheSlot}".`,
            onError
        );
        return null;
    }
    if (!transform || active.transform === transform) return active.promise;
    return active.raw.then((raw) => transform(raw));
};
