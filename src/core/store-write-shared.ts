/**
 * @module store-write-shared
 *
 * LAYER: Store runtime
 * OWNS:  Shared write helpers for set/replace/reset/hydrate.
 *
 * Consumers: store-set-impl, store-replace-impl, store-admin-impl.
 */
import { warn, log, isDev } from "../utils.js";
import { setStoreValueInternal } from "./store-lifecycle/registry.js";
import { runFeatureWriteHooks, runStoreHookSafe } from "./store-lifecycle/hooks.js";
import { invalidatePathCache } from "./store-lifecycle/validation.js";
import { notifyStore } from "./store-shared/notify.js";
import { getWriteContext, type WriteContext } from "../internals/write-context.js";
import type { TraceContext } from "../types/utility.js";
import type { StoreRegistry } from "./store-registry.js";
import type { StoreValue } from "./store-lifecycle/types.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import {
    isTransactionActive,
    stageTransactionValue,
    stageTransactionPatches,
    registerTransactionCommit,
} from "./store-transaction.js";
import {
    createRootSetRuntimePatch,
    setLastRuntimePatches,
    type RuntimePatch,
} from "./runtime-patch.js";
import {
    reconcileHydrationValue,
    runHydrationInvalidationHandler,
    type HydrationConsistencySource,
} from "./hydration-consistency.js";

export type CommitAction = "set" | "reset" | "hydrate" | "replace";
export type CommitHookLabel = "onSet" | "onReset";
export type CommitMetricsUpdate = {
    resetElapsedMs?: number;
};
export type CommitArgs = {
    name: string;
    prev: StoreValue;
    next: StoreValue;
    action: CommitAction;
    hookLabel: CommitHookLabel;
    logMessage: string;
    context?: WriteContext | null;
    runtimePatches?: readonly RuntimePatch[];
    metricsUpdate?: CommitMetricsUpdate;
    normalizeHydrationCandidate?: (candidate: StoreValue) => { ok: boolean; value?: StoreValue };
};

const SLOW_MUTATOR_WARN_MS = 32;
const slowMutatorWarned = new Set<string>();
registerTestResetHook("store-write.slow-mutator-warned", () => slowMutatorWarned.clear(), 65);

const bumpUpdateCount = (entry: { updateCount: number }): void => {
    if (entry.updateCount >= Number.MAX_SAFE_INTEGER) {
        entry.updateCount = 0;
        return;
    }
    entry.updateCount += 1;
};

export const clearSlowMutatorWarnings = (): void => {
    slowMutatorWarned.clear();
};

export const forgetSlowMutatorWarning = (storeName: string): void => {
    slowMutatorWarned.delete(storeName);
};

export const maybeWarnSlowMutator = (storeName: string, elapsedMs: number): void => {
    if (!isDev()) return;
    if (elapsedMs < SLOW_MUTATOR_WARN_MS) return;
    if (slowMutatorWarned.has(storeName)) return;
    slowMutatorWarned.add(storeName);
    warn(
        `setStore("${storeName}", mutator) took ${elapsedMs}ms. ` +
        `Mutator writes clone the entire store; consider path writes or smaller stores for hot paths.`
    );
};

export const resolveWriteContext = (context?: WriteContext | null): WriteContext | null =>
    context ?? getWriteContext();

const resolveHydrationSource = (
    action: CommitAction,
    context?: WriteContext | null
): HydrationConsistencySource => {
    if (context?.sourceHint) return context.sourceHint;
    if (action === "hydrate") return "hydrate";
    return "effect";
};

const resolvePatchSource = (action: CommitAction): "setStore" | "replaceStore" | "resetStore" | "hydrateStores" => {
    if (action === "replace") return "replaceStore";
    if (action === "reset") return "resetStore";
    if (action === "hydrate") return "hydrateStores";
    return "setStore";
};

const applyMetricsUpdate = (
    entry: StoreRegistry["metaEntries"][string] | undefined,
    update?: CommitMetricsUpdate
): void => {
    if (!entry || !update) return;
    const resetElapsedMs = update.resetElapsedMs;
    if (typeof resetElapsedMs === "number") {
        entry.metrics.resetCount = (entry.metrics.resetCount ?? 0) + 1;
        entry.metrics.totalResetMs = (entry.metrics.totalResetMs ?? 0) + resetElapsedMs;
        entry.metrics.lastResetMs = resetElapsedMs;
    }
};

const commitStoreUpdate = (
    registry: StoreRegistry,
    { name, prev, next, action, hookLabel, logMessage, context, metricsUpdate }: CommitArgs
): void => {
    const registryMeta = registry.metaEntries;
    setStoreValueInternal(name, next, registry);
    invalidatePathCache(name);
    const updatedAtMs = Date.now();
    registryMeta[name].updatedAt = new Date(updatedAtMs).toISOString();
    registryMeta[name].updatedAtMs = updatedAtMs;
    const resolvedContext = context ?? getWriteContext();
    if (resolvedContext && (resolvedContext.correlationId || resolvedContext.traceContext)) {
        registryMeta[name].lastCorrelationId = resolvedContext.correlationId ?? null;
        registryMeta[name].lastCorrelationAt = new Date(updatedAtMs).toISOString();
        registryMeta[name].lastCorrelationAtMs = updatedAtMs;
        registryMeta[name].lastTraceContext = (resolvedContext.traceContext ?? null) as TraceContext | null;
    } else {
        registryMeta[name].lastCorrelationId = null;
        registryMeta[name].lastCorrelationAt = null;
        registryMeta[name].lastCorrelationAtMs = null;
        registryMeta[name].lastTraceContext = null;
    }
    bumpUpdateCount(registryMeta[name]);
    applyMetricsUpdate(registryMeta[name], metricsUpdate);
    runFeatureWriteHooks(name, action, prev, next, notifyStore);
    runStoreHookSafe(name, hookLabel, registryMeta[name].options[hookLabel], [prev, next]);
    notifyStore(name);
    log(logMessage);
};

export const stageOrCommitUpdate = (registry: StoreRegistry, args: CommitArgs): void => {
    const resolvedContext = args.context ?? getWriteContext();
    const source = resolveHydrationSource(args.action, resolvedContext);
    const reconciled = reconcileHydrationValue({
        registry,
        store: args.name,
        value: args.next,
        source,
        normalize: args.normalizeHydrationCandidate,
    });
    const nextValue = reconciled.value as StoreValue;
    const runtimePatches =
        args.runtimePatches
        && args.runtimePatches.length > 0
        && Object.is(nextValue, args.next)
            ? args.runtimePatches
            : (args.runtimePatches && args.runtimePatches.length > 0
                ? [
                    createRootSetRuntimePatch({
                        store: args.name,
                        value: nextValue,
                        source: resolvePatchSource(args.action),
                        context: resolvedContext,
                    }),
                ]
                : args.runtimePatches);
    const afterCommit = (): void => {
        if (!reconciled.invalidated) return;
        runHydrationInvalidationHandler(registry, args.name, reconciled.event?.live ?? nextValue, source);
        if (!reconciled.needsRefetch || !registry.async.fetchRegistry[args.name]) return;
        queueMicrotask(() => {
            void import("../async/fetch.js")
                .then(async ({ refetchStore }) => {
                    await refetchStore({ name: args.name } as { name: string });
                })
                .catch((error) => {
                    warn(
                        `Post-hydration refetch for "${args.name}" failed: ${(error as { message?: string })?.message ?? error}`
                    );
                });
        });
    };
    if (isTransactionActive()) {
        stageTransactionValue(args.name, nextValue);
        stageTransactionPatches(runtimePatches ?? []);
        registerTransactionCommit(() => {
            commitStoreUpdate(registry, {
                ...args,
                next: nextValue,
                context: resolvedContext,
                runtimePatches,
            });
            afterCommit();
        });
        return;
    }
    commitStoreUpdate(registry, {
        ...args,
        next: nextValue,
        context: resolvedContext,
        runtimePatches,
    });
    if (runtimePatches && runtimePatches.length > 0) {
        setLastRuntimePatches(runtimePatches, registry);
    }
    afterCommit();
};
