/**
 * @module async/inflight
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/inflight.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getAsyncMetrics,
    getInflightRegistry,
    getOrCreateAsyncStoreMetrics,
    getRequestSequenceRegistry,
    getRequestVersionRegistry,
    releaseAsyncSlotIfOrphaned,
    trackAsyncSlot,
} from "./cache.js";
import type { FetchOptions } from "./cache.js";
import { reportAsyncUsageError } from "./errors.js";
import { shallowEqual } from "../utils.js";

export type InflightRequestContract = {
    requestKind: "url" | "promise" | "factory";
    requestRef?: unknown;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    responseType?: FetchOptions["responseType"];
    stateAdapter?: FetchOptions["stateAdapter"];
};

export type InflightEntry = {
    promise: Promise<unknown>;
    raw: Promise<unknown>;
    transform?: FetchOptions["transform"];
    cloneResult?: FetchOptions["cloneResult"];
    contract?: InflightRequestContract;
};

export type DedupeRequest = {
    contract?: InflightRequestContract;
    transform?: FetchOptions["transform"];
    cloneResult?: FetchOptions["cloneResult"];
};

const sameOptionValue = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    return shallowEqual(a, b);
};

const sameRequestContract = (
    active: InflightRequestContract | undefined,
    next: InflightRequestContract | undefined
): boolean => {
    if (!active || !next) return true;
    if (active.requestKind !== next.requestKind) return false;
    if (active.requestKind === "url") {
        if (active.url !== next.url) return false;
    } else if (!Object.is(active.requestRef, next.requestRef)) {
        return false;
    }
    return active.method === next.method
        && active.responseType === next.responseType
        && active.stateAdapter === next.stateAdapter
        && sameOptionValue(active.headers, next.headers)
        && sameOptionValue(active.body, next.body);
};

export const isCurrentRequest = (cacheSlot: string, version: number): boolean =>
    (getRequestVersionRegistry()[cacheSlot] ?? 0) === version;

export const reserveRequestVersion = (cacheSlot: string, storeName?: string): number => {
    if (storeName) trackAsyncSlot(storeName, cacheSlot);
    const requestSequence = getRequestSequenceRegistry();
    const requestVersion = getRequestVersionRegistry();
    const currentVersion = (requestSequence[cacheSlot] ?? 0) + 1;
    requestSequence[cacheSlot] = currentVersion;
    requestVersion[cacheSlot] = currentVersion;
    return currentVersion;
};

export const clearRequestVersion = (cacheSlot: string, version: number): void => {
    const requestVersion = getRequestVersionRegistry();
    if (requestVersion[cacheSlot] === version) {
        delete requestVersion[cacheSlot];
        releaseAsyncSlotIfOrphaned(cacheSlot);
    }
};

export const setInflightEntry = (cacheSlot: string, entry: InflightEntry, storeName?: string): void => {
    if (storeName) trackAsyncSlot(storeName, cacheSlot);
    const inflight = getInflightRegistry();
    (inflight as Record<string, InflightEntry>)[cacheSlot] = entry;
};

export const clearInflightEntry = (cacheSlot: string): void => {
    const inflight = getInflightRegistry();
    delete inflight[cacheSlot];
    releaseAsyncSlotIfOrphaned(cacheSlot);
};

export const hasInflightEntry = (cacheSlot: string): boolean =>
    Boolean(getInflightRegistry()[cacheSlot]);

export const tryDedupeRequest = (
    name: string,
    cacheSlot: string,
    request: DedupeRequest,
    onError?: (message: string) => void
): Promise<unknown> | null | undefined => {
    const active = getInflightRegistry()[cacheSlot] as InflightEntry | undefined;
    if (!active) return undefined;

    getAsyncMetrics().dedupes += 1;
    getOrCreateAsyncStoreMetrics(name).dedupes += 1;
    if (!sameRequestContract(active.contract, request.contract)) {
        reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot dedupe callers that use different request or state contracts for cacheSlot "${cacheSlot}".`,
            onError
        );
        return null;
    }
    if (active.transform !== request.transform || active.cloneResult !== request.cloneResult) {
        reportAsyncUsageError(
            name,
            `fetchStore("${name}") cannot dedupe callers that use different result contracts for cacheSlot "${cacheSlot}".`,
            onError
        );
        return null;
    }
    return active.promise;
};
