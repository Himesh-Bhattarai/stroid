/**
 * @module hydration-consistency/reconcile
 *
 * LAYER: Store runtime
 * OWNS:  Drift reconciliation and invalidation handling for hydrated stores.
 *
 * Consumers: write paths and feature state application.
 */
import { deepClone, hashState, isDev, warnAlways } from "../../utils.js";
import type { StoreRegistry } from "../store-registry.js";
import {
    cloneHydrationMetadata,
    mergeHydrationValues,
    nextHydrationSequence,
    pushHydrationDriftEvent,
    warnHydrationInvalidationError,
} from "./helpers.js";
import type {
    HydrationConsistencyResolution,
    HydrationConsistencySource,
    HydrationReconcileResult,
} from "./types.js";

export const reconcileHydrationValue = (args: {
    registry: StoreRegistry;
    store: string;
    value: unknown;
    source: HydrationConsistencySource;
    normalize?: (candidate: unknown) => { ok: boolean; value?: unknown };
}): HydrationReconcileResult => {
    const entry = args.registry.hydration.stores[args.store];
    if (!entry) {
        return {
            value: args.value,
            event: null,
            invalidated: false,
            needsRefetch: false,
        };
    }

    const baselineHash = entry.baselineHash;
    const liveHash = hashState(args.value);
    entry.lastSource = args.source;
    entry.currentHash = liveHash;

    if (entry.policy === "invalidate_and_refetch" && args.source === "network") {
        entry.baseline = deepClone(args.value);
        entry.baselineHash = liveHash;
        entry.currentHash = liveHash;
        entry.invalidatedAt = null;
        entry.invalidatedAtMs = null;
        entry.lastResolution = "stable";
        return {
            value: args.value,
            event: null,
            invalidated: false,
            needsRefetch: false,
        };
    }

    if (liveHash === baselineHash) {
        entry.lastResolution = "stable";
        entry.invalidatedAt = null;
        entry.invalidatedAtMs = null;
        return {
            value: args.value,
            event: null,
            invalidated: false,
            needsRefetch: false,
        };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    if (entry.firstDivergedAtMs === null) {
        entry.firstDivergedAtMs = nowMs;
        entry.firstDivergedAt = nowIso;
    }
    entry.lastDivergedAtMs = nowMs;
    entry.lastDivergedAt = nowIso;
    entry.driftCount += 1;
    args.registry.hydration.metrics.driftEvents += 1;

    let resolved = args.value;
    let resolution: HydrationConsistencyResolution = "client_kept";
    let invalidated = false;
    let needsRefetch = false;

    if (entry.policy === "server_wins") {
        resolved = deepClone(entry.baseline);
        resolution = "server_reverted";
    } else if (entry.policy === "merge") {
        try {
            resolved = entry.merge
                ? entry.merge({
                    store: args.store,
                    baseline: deepClone(entry.baseline),
                    live: deepClone(args.value),
                    source: args.source,
                })
                : mergeHydrationValues(entry.baseline, args.value);
            resolution = "merged";
        } catch (err) {
            warnAlways(
                `hydrateStores(...) consistency merge for "${args.store}" threw: ` +
                `${(err as { message?: string })?.message ?? err}. Falling back to the hydrated baseline.`
            );
            resolved = deepClone(entry.baseline);
            resolution = "server_reverted";
        }
    } else if (entry.policy === "invalidate_and_refetch") {
        invalidated = true;
        needsRefetch = true;
        entry.invalidatedAtMs = nowMs;
        entry.invalidatedAt = nowIso;
        args.registry.hydration.metrics.invalidations += 1;
        resolution = "invalidated";
    }

    if (args.normalize && (resolution === "merged" || resolution === "server_reverted")) {
        try {
            const normalized = args.normalize(resolved);
            if (!normalized.ok) {
                resolved = deepClone(entry.baseline);
                resolution = "server_reverted";
            } else {
                resolved = normalized.value;
            }
        } catch (err) {
            warnAlways(
                `hydrateStores(...) normalization for "${args.store}" threw during reconciliation: ` +
                `${(err as { message?: string })?.message ?? err}. Falling back to the hydrated baseline.`
            );
            resolved = deepClone(entry.baseline);
            resolution = "server_reverted";
        }
    }

    const resolvedHash = hashState(resolved);
    entry.currentHash = resolvedHash;
    entry.lastResolution = resolution;
    args.registry.hydration.metrics.reconciliations += 1;

    let baselineSnapshot: unknown = null;
    let liveSnapshot: unknown = null;
    let resolvedSnapshot: unknown = null;
    if (isDev()) {
        baselineSnapshot = deepClone(entry.baseline);
        liveSnapshot = deepClone(args.value);
        resolvedSnapshot =
            Object.is(resolved, args.value)
                ? liveSnapshot
                : Object.is(resolved, entry.baseline)
                    ? baselineSnapshot
                    : deepClone(resolved);
    }

    const event = {
        id: `hydration-drift:${nowMs}:${nextHydrationSequence(args.registry.hydration)}`,
        store: args.store,
        source: args.source,
        authority: entry.authority,
        policy: entry.policy,
        resolution,
        detectedAt: nowIso,
        detectedAtMs: nowMs,
        firstDivergedAt: entry.firstDivergedAt ?? nowIso,
        firstDivergedAtMs: entry.firstDivergedAtMs ?? nowMs,
        hydratedAt: entry.hydratedAt,
        hydratedAtMs: entry.hydratedAtMs,
        baselineHash,
        liveHash,
        resolvedHash,
        invalidated,
        metadata: cloneHydrationMetadata(entry),
        baseline: baselineSnapshot,
        live: liveSnapshot,
        resolved: resolvedSnapshot,
    };

    pushHydrationDriftEvent(args.registry.hydration, event);
    return {
        value: resolved,
        event,
        invalidated,
        needsRefetch,
    };
};

export const runHydrationInvalidationHandler = (
    registry: StoreRegistry,
    store: string,
    live: unknown,
    source: HydrationConsistencySource
): void => {
    const entry = registry.hydration.stores[store];
    if (!entry?.onInvalidate) return;
    try {
        entry.onInvalidate({
            store,
            baseline: deepClone(entry.baseline),
            live: deepClone(live),
            source,
        });
    } catch (err) {
        warnHydrationInvalidationError(store, err);
    }
};
