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
    registerTransactionCommit,
} from "./store-transaction.js";

export type CommitAction = "set" | "reset" | "hydrate" | "replace";
export type CommitHookLabel = "onSet" | "onReset";
export type CommitArgs = {
    name: string;
    prev: StoreValue;
    next: StoreValue;
    action: CommitAction;
    hookLabel: CommitHookLabel;
    logMessage: string;
    context?: WriteContext | null;
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

const commitStoreUpdate = (registry: StoreRegistry, { name, prev, next, action, hookLabel, logMessage, context }: CommitArgs): void => {
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
    runFeatureWriteHooks(name, action, prev, next, notifyStore);
    runStoreHookSafe(name, hookLabel, registryMeta[name].options[hookLabel], [prev, next]);
    notifyStore(name);
    log(logMessage);
};

export const stageOrCommitUpdate = (registry: StoreRegistry, args: CommitArgs): void => {
    const resolvedContext = args.context ?? getWriteContext();
    if (isTransactionActive()) {
        stageTransactionValue(args.name, args.next);
        registerTransactionCommit(() => commitStoreUpdate(registry, { ...args, context: resolvedContext }));
        return;
    }
    commitStoreUpdate(registry, { ...args, context: resolvedContext });
};
