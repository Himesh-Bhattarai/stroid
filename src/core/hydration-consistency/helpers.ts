/**
 * @module hydration-consistency/helpers
 *
 * LAYER: Store runtime
 * OWNS:  Shared pure helpers for hydration consistency state and event handling.
 *
 * Consumers: hydration-consistency runtime modules.
 */
import { deepClone, warnAlways } from "../../utils.js";
import type {
    HydrationConsistencyAuthority,
    HydrationConsistencyContract,
    HydrationConsistencySource,
    HydrationConsistencyStoreContract,
    HydrationConsistencyStorePolicy,
    HydrationConsistencyStoreState,
    HydrationDriftEvent,
    HydrationInvalidateArgs,
    HydrationMergeArgs,
    HydrationRuntimeState,
    HydrationSnapshotMetadata,
    InternalStorePolicy,
} from "./types.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

export const mergeHydrationValues = (baseline: unknown, live: unknown): unknown => {
    if (isPlainObject(baseline) && isPlainObject(live)) {
        const next: Record<string, unknown> = {};
        const keys = new Set([
            ...Object.keys(baseline),
            ...Object.keys(live),
        ]);
        keys.forEach((key) => {
            const hasBaseline = Object.prototype.hasOwnProperty.call(baseline, key);
            const hasLive = Object.prototype.hasOwnProperty.call(live, key);
            if (hasBaseline && hasLive) {
                next[key] = mergeHydrationValues(
                    (baseline as Record<string, unknown>)[key],
                    (live as Record<string, unknown>)[key]
                );
                return;
            }
            if (hasLive) {
                next[key] = deepClone((live as Record<string, unknown>)[key]);
                return;
            }
            next[key] = deepClone((baseline as Record<string, unknown>)[key]);
        });
        return next;
    }
    return deepClone(live);
};

export const resolveHydrationAuthority = (
    storeContract?: HydrationConsistencyStoreContract,
    contract?: HydrationConsistencyContract
): HydrationConsistencyAuthority =>
    storeContract?.authority
    ?? contract?.authority
    ?? "server-authoritative";

export const resolveHydrationPolicy = (
    storePolicy: HydrationConsistencyStorePolicy | undefined,
    authority: HydrationConsistencyAuthority
): InternalStorePolicy => {
    if (typeof storePolicy === "string") {
        return { policy: storePolicy };
    }
    if (storePolicy && typeof storePolicy === "object") {
        return {
            policy: storePolicy.policy,
            merge: storePolicy.merge as InternalStorePolicy["merge"],
            onInvalidate: storePolicy.onInvalidate as InternalStorePolicy["onInvalidate"],
        };
    }
    if (authority === "client-authoritative") return { policy: "client_wins" };
    if (authority === "mergeable") return { policy: "merge" };
    return { policy: "server_wins" };
};

export const nextHydrationSequence = (state: HydrationRuntimeState): number => {
    if (state.sequence >= Number.MAX_SAFE_INTEGER) {
        state.sequence = 0;
    }
    state.sequence += 1;
    return state.sequence;
};

export const cloneHydrationMetadata = (
    entry: HydrationConsistencyStoreState
): HydrationSnapshotMetadata => ({
    ...(entry.snapshotVersion !== undefined ? { snapshotVersion: entry.snapshotVersion } : {}),
    ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
    ...(entry.checksum !== undefined ? { checksum: entry.checksum } : {}),
    ...(entry.schemaSignature !== undefined ? { schemaSignature: entry.schemaSignature } : {}),
});

export const pushHydrationDriftEvent = (
    state: HydrationRuntimeState,
    event: HydrationDriftEvent
): void => {
    state.events.push(event);
    if (state.events.length > state.maxEvents) {
        state.events.splice(0, state.events.length - state.maxEvents);
    }
    if (!state.onDrift) return;
    try {
        state.onDrift(event);
    } catch (err) {
        warnAlways(
            `hydrateStores(...) consistency.onDrift threw: ${(err as { message?: string })?.message ?? err}`
        );
    }
};

export const warnHydrationInvalidationError = (
    store: string,
    err: unknown
): void => {
    warnAlways(
        `hydrateStores(...) consistency invalidation handler for "${store}" threw: ${(err as { message?: string })?.message ?? err}`
    );
};
