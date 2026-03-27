/**
 * @module async/inflight
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/inflight.
 *
 * Consumers: Internal imports and public API.
 */
import { getAsyncMetrics, getInflightRegistry, getRequestSequenceRegistry, getRequestVersionRegistry } from "./cache.js";
import type { FetchOptions } from "./cache.js";
import { reportAsyncUsageError } from "./errors.js";

export type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };

export const isCurrentRequest = (cacheSlot: string, version: number): boolean =>
    (getRequestVersionRegistry()[cacheSlot] ?? 0) === version;

export const reserveRequestVersion = (cacheSlot: string): number => {
    const requestSequence = getRequestSequenceRegistry();
    const requestVersion = getRequestVersionRegistry();
    const currentVersion = (requestSequence[cacheSlot] ?? 0) + 1;
    requestSequence[cacheSlot] = currentVersion;
    requestVersion[cacheSlot] = currentVersion;
    return currentVersion;
};

export const clearRequestVersion = (cacheSlot: string, version: number): void => {
    const requestVersion = getRequestVersionRegistry();
    if (requestVersion[cacheSlot] === version) delete requestVersion[cacheSlot];
};

export const setInflightEntry = (cacheSlot: string, entry: InflightEntry): void => {
    const inflight = getInflightRegistry();
    (inflight as Record<string, InflightEntry>)[cacheSlot] = entry;
};

export const clearInflightEntry = (cacheSlot: string): void => {
    const inflight = getInflightRegistry();
    delete inflight[cacheSlot];
};

export const hasInflightEntry = (cacheSlot: string): boolean =>
    Boolean(getInflightRegistry()[cacheSlot]);

export const tryDedupeRequest = (
    name: string,
    cacheSlot: string,
    transform: FetchOptions["transform"] | undefined,
    onError?: (message: string) => void
): Promise<unknown> | null | undefined => {
    const active = getInflightRegistry()[cacheSlot] as InflightEntry | undefined;
    if (!active) return undefined;

    getAsyncMetrics().dedupes += 1;
    if (active.transform && active.transform !== transform) {
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
