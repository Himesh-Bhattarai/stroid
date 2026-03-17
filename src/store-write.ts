/**
 * @module store-write
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-write.
 *
 * Consumers: Internal imports and public API.
 */
import {
    warn,
    warnAlways,
    error,
    log,
    isDev,
    isValidData,
    isValidStoreName,
    validateDepth,
    setByPath,
    deepClone,
    type PathInput,
} from "./utils.js";
import { type StoreOptions } from "./adapters/options.js";
import {
    setStoreValueInternal,
    getStoreValueRef,
    hasStoreEntryInternal,
    getRegistry,
    getStoreAdmin,
} from "./store-lifecycle/registry.js";
import {
    sanitizeValue,
    normalizeCommittedState,
    validatePathSafety,
    invalidatePathCache,
    materializeInitial,
} from "./store-lifecycle/validation.js";
import {
    runFeatureWriteHooks,
    runMiddlewareForStore,
    runStoreHookSafe,
} from "./store-lifecycle/hooks.js";
import {
    nameOf,
    exists,
    reportStoreError,
    reportStoreWarning,
} from "./store-lifecycle/identity.js";
import type {
    PartialDeep,
    Path,
    PathValue,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StoreStateMap,
    StrictStoreMap,
    HydrateSnapshotFor,
    StateFor,
    WriteResult,
} from "./store-lifecycle/types.js";
import type { StoreRegistry } from "./store-registry.js";
import { getConfig } from "./internals/config.js";
import { runTestResets, registerTestResetHook } from "./internals/test-reset.js";
import { notify } from "./store-notify.js";
import { MIDDLEWARE_ABORT } from "./features/lifecycle.js";
import { createStore, createStoreStrict, clearSsrGlobalAllowWarned } from "./store-create.js";
import { getWriteContext, type WriteContext } from "./internals/write-context.js";
import type { TraceContext } from "./types/utility.js";

export { createStore, createStoreStrict };
import {
    isTransactionActive,
    getStagedTransactionValue,
    stageTransactionValue,
    registerTransactionCommit,
    markTransactionFailed,
} from "./store-transaction.js";

type KeyOrData = StoreValue | string | string[] | Record<string, unknown> | ((draft: any) => void);
// If store names are loose (not registered via StoreStateMap), fall back to untyped paths/values.
type IsStoreNameLoose = string extends StoreName ? true : false;
type StoreUpdate<State> = State | Partial<State> | PartialDeep<State> | ((draft: State) => void);
type StoreTarget<Name extends string = string, State = StoreValue> =
    | StoreDefinition<Name, State>
    | StoreKey<Name, State>
    | StoreName;
type StoreStateForTarget<T> =
    T extends StoreDefinition<any, infer S> ? S
        : T extends StoreKey<any, infer S> ? S
            : (T extends StoreName ? StateFor<T> : StoreValue);
type StorePathForTarget<T> =
    T extends StoreDefinition<any, infer S> ? Path<S>
        : T extends StoreKey<any, infer S> ? Path<S>
            : (IsStoreNameLoose extends true ? string | string[] : (T extends StoreName ? Path<StateFor<T>> : string | string[]));
type StorePathValueForTarget<T, P> =
    T extends StoreDefinition<any, infer S>
        ? (P extends Path<S> ? PathValue<S, P> : never)
        : T extends StoreKey<any, infer S>
            ? (P extends Path<S> ? PathValue<S, P> : never)
            : (IsStoreNameLoose extends true ? unknown : (T extends StoreName ? (P extends Path<StateFor<T>> ? PathValue<StateFor<T>, P> : never) : unknown));
type StoreUpdateForTarget<T> =
    T extends StoreDefinition<any, infer S> ? StoreUpdate<S>
        : T extends StoreKey<any, infer S> ? StoreUpdate<S>
            : (IsStoreNameLoose extends true ? StoreUpdate<StoreValue> : (T extends StoreName ? StoreUpdate<StateFor<T>> : StoreUpdate<StoreValue>));
type HydrateSnapshot = HydrateSnapshotFor<StoreStateMap & StrictStoreMap>;
type HydrateOptions<Snapshot extends object> =
    Partial<{ [K in keyof Snapshot]: StoreOptions<Snapshot[K]> }> & { default?: StoreOptions };
type HydrationTrustBase<Snapshot extends object> = {
    /**
     * Explicitly trust this snapshot and allow hydration.
     */
    allowTrusted?: boolean;
    /**
     * Alias for allowTrusted.
     */
    allowHydration?: boolean;
    /**
     * @deprecated Use allowTrusted instead.
     */
    allowUntrusted?: boolean;
    validate?: (snapshot: Snapshot) => boolean;
    onValidationError?: (error: unknown, snapshot: Snapshot) => boolean;
};
type HydrationTrust<Snapshot extends object> =
    | (HydrationTrustBase<Snapshot> & { allowTrusted: true })
    | (HydrationTrustBase<Snapshot> & { allowHydration: true })
    | (HydrationTrustBase<Snapshot> & { allowUntrusted: true })
    | (HydrationTrustBase<Snapshot> & { validate: (snapshot: Snapshot) => boolean });

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
const warnSlowMutator = (storeName: string, elapsedMs: number): void => {
    if (!isDev()) return;
    if (elapsedMs < SLOW_MUTATOR_WARN_MS) return;
    if (slowMutatorWarned.has(storeName)) return;
    slowMutatorWarned.add(storeName);
    warn(
        `setStore("${storeName}", mutator) took ${elapsedMs}ms. ` +
        `Mutator writes clone the entire store; consider path writes or smaller stores for hot paths.`
    );
};

type CommitAction = "set" | "reset" | "hydrate" | "replace";
type CommitHookLabel = "onSet" | "onReset";
type CommitArgs = {
    name: string;
    prev: StoreValue;
    next: StoreValue;
    action: CommitAction;
    hookLabel: CommitHookLabel;
    logMessage: string;
    context?: WriteContext | null;
};

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
    runFeatureWriteHooks(name, action, prev, next, notify);
    runStoreHookSafe(name, hookLabel, registryMeta[name].options[hookLabel], [prev, next]);
    notify(name);
    log(logMessage);
};

const stageOrCommitUpdate = (registry: StoreRegistry, args: CommitArgs): void => {
    const resolvedContext = args.context ?? getWriteContext();
    if (isTransactionActive()) {
        stageTransactionValue(args.name, args.next);
        registerTransactionCommit(() => commitStoreUpdate(registry, { ...args, context: resolvedContext }));
        return;
    }
    commitStoreUpdate(registry, { ...args, context: resolvedContext });
};

const resolveWriteContext = (context?: WriteContext | null): WriteContext | null =>
    context ?? getWriteContext();

export function setStore<T extends StoreTarget, P extends StorePathForTarget<T>>(
    name: T,
    path: P,
    value: StorePathValueForTarget<T, P>
): WriteResult;
export function setStore<T extends StoreTarget>(
    name: T,
    update: StoreUpdateForTarget<T>
): WriteResult;
export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): WriteResult {
    return setStoreInternal(name, keyOrData, value);
}
const setStoreInternal = (
    name: string | StoreDefinition<string, StoreValue>,
    keyOrData: KeyOrData,
    value?: unknown,
    context?: WriteContext | null
): WriteResult => {
    const storeName = nameOf(name);
    const registry = getRegistry();
    const registryMeta = registry.metaEntries;
    if (!materializeInitial(storeName, registry)) return { ok: false, reason: "validate" };
    if (!hasStoreEntryInternal(storeName, registry)) {
        const message =
            `setStore("${storeName}") called before createStore(). ` +
            `Create the store first or pass a valid StoreDefinition.`;
        reportStoreError(storeName, message);
        if (isTransactionActive()) markTransactionFailed(message);
        return { ok: false, reason: "not-found" };
    }
    let updated: StoreValue;
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(storeName) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : getStoreValueRef(storeName, registry);

    const usedMutator = typeof keyOrData === "function" && value === undefined;

    if (usedMutator) {
        const mutatorStart = isDev() ? Date.now() : 0;
        try {
            const producer = getConfig().mutatorProduce;
            let didReturn = false;
            let returnedValue: unknown = undefined;
            const recipe = (draft: StoreValue) => {
                const result = (keyOrData as (draft: StoreValue) => void)(draft);
                if (result !== undefined) {
                    didReturn = true;
                    returnedValue = result;
                }
                return result;
            };
            const draft = producer
                ? producer(prev as StoreValue, recipe as (draft: StoreValue) => void)
                : (() => {
                    const clone = deepClone(prev);
                    recipe(clone);
                    return clone;
                })();
            if (didReturn && getConfig().strictMutatorReturns) {
                const message =
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Strict mutator mode forbids return values; mutate the draft instead.`;
                reportStoreError(storeName, message);
                if (isTransactionActive()) markTransactionFailed(message);
                return { ok: false, reason: "validate" };
            }
            if (didReturn && isDev() && !getConfig().strictMutatorReturns) {
                warn(
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Return values replace the entire store; return void to apply draft mutations instead.`
                );
            }
            updated = (didReturn && !getConfig().strictMutatorReturns)
                ? (returnedValue as StoreValue)
                : (draft as StoreValue);
        } catch (err) {
            reportStoreError(storeName, `Mutator for "${storeName}" failed: ${(err as { message?: string })?.message ?? err}`);
            if (isTransactionActive()) markTransactionFailed(err);
            return { ok: false, reason: "validate" };
        } finally {
            if (mutatorStart) {
                warnSlowMutator(storeName, Date.now() - mutatorStart);
            }
        }
    } else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) {
            if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") received invalid data`);
            return { ok: false, reason: "invalid-args" };
        }
        if (typeof prev !== "object" || prev === null || Array.isArray(prev)) {
            error(
                `setStore("${storeName}", data) only merges into object stores.\n` +
                `Use setStore("${storeName}", "path", value) or recreate the store with an object shape.`
            );
            if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") attempted object merge on non-object store`);
            return { ok: false, reason: "validate" };
        }
        const partialResult = sanitizeValue(storeName, keyOrData);
        if (!partialResult.ok) {
            if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") failed sanitize`);
            return { ok: false, reason: "validate" };
        }
        updated = { ...(prev as Record<string, unknown>), ...partialResult.value as Record<string, unknown> };
    } else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData as PathInput)) {
            if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") received invalid path`);
            return { ok: false, reason: "invalid-args" };
        }
        const valueResult = sanitizeValue(storeName, value);
        if (!valueResult.ok) {
            if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") failed sanitize`);
            return { ok: false, reason: "validate" };
        }
        const sanitizedValue = valueResult.value;
        const safePath = validatePathSafety(storeName, prev, keyOrData as PathInput, sanitizedValue);
        if (!safePath.ok) {
            registryMeta[storeName]?.options?.onError?.(safePath.reason ?? `Invalid path for "${storeName}".`);
            if (isTransactionActive()) markTransactionFailed(safePath.reason);
            return { ok: false, reason: "path" };
        }
        updated = setByPath(prev as Record<string, unknown>, keyOrData as PathInput, sanitizedValue);
    } else {
        const message =
            `setStore("${storeName}") - invalid arguments.\n` +
            `Usage:\n` +
            `  setStore("${storeName}", "field", value)\n` +
            `  setStore("${storeName}", "nested.field", value)\n` +
            `  setStore("${storeName}", { field: value })\n` +
            `  setStore(storeDef, draft => { draft.field = value })\n` +
            `  replaceStore("${storeName}", value)  // full-store replace`;
        error(message);
        registryMeta[storeName]?.options?.onError?.(message);
        if (isTransactionActive()) markTransactionFailed(message);
        return { ok: false, reason: "invalid-args" };
    }

    if (!isValidData(updated)) {
        if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") produced invalid data`);
        return { ok: false, reason: "validate" };
    }
    const validateRule = registryMeta[storeName]?.options?.validate;

    const writeContext = resolveWriteContext(context);
    const next = runMiddlewareForStore(storeName, {
        action: "set",
        prev,
        next: updated,
        path: keyOrData,
        correlationId: writeContext?.correlationId,
        traceContext: writeContext?.traceContext,
    });
    if (next === MIDDLEWARE_ABORT) {
        if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") aborted by middleware`);
        return { ok: false, reason: "middleware" };
    }
    const reuseInput = usedMutator && next === updated;
    const committed = normalizeCommittedState(storeName, next, validateRule, undefined, reuseInput ? { reuseInput: true } : undefined);
    if (!committed.ok) {
        if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") failed validation`);
        return { ok: false, reason: "validate" };
    }

    stageOrCommitUpdate(registry, {
        name: storeName,
        prev,
        next: committed.value,
        action: "set",
        hookLabel: "onSet",
        logMessage: `Store "${storeName}" updated`,
        context: writeContext,
    });
    return { ok: true };
};

export const setStoreWithContext = (
    name: string | StoreDefinition<string, StoreValue>,
    keyOrData: KeyOrData,
    value: unknown,
    context: WriteContext | null
): WriteResult => setStoreInternal(name, keyOrData, value, context);

export function replaceStore<Name extends string, State>(name: StoreDefinition<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends string, State>(name: StoreKey<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends StoreName>(name: Name, value: StateFor<Name>): WriteResult;
export function replaceStore(nameInput: string | StoreDefinition<string, StoreValue>, value: unknown): WriteResult {
    const storeName = nameOf(nameInput);
    if (!storeName) return { ok: false, reason: "invalid-args" };

    const registry = getRegistry();
    const result = replaceStoreState(registry, storeName, value, "replace");
    if (!result.ok) {
        if (result.reason === "not-found") return { ok: false, reason: "not-found" };
        if (result.reason === "middleware") return { ok: false, reason: "middleware" };
        return { ok: false, reason: "validate" };
    }
    return { ok: true };
}

export function deleteStore<Name extends string, State>(name: StoreDefinition<Name, State>): void;
export function deleteStore<Name extends string, State>(name: StoreKey<Name, State>): void;
export function deleteStore<Name extends StoreName>(name: Name): void;
export function deleteStore(nameInput: string | StoreDefinition<string, StoreValue>): void {
    const name = nameOf(nameInput);
    if (!exists(name)) return;
    const registry = getRegistry();
    if (!materializeInitial(name, registry)) return;
    if (isTransactionActive()) {
        const message =
            `deleteStore("${name}") cannot be called inside setStoreBatch. ` +
            `Move deleteStore outside the batch to preserve transaction semantics.`;
        reportStoreWarning(name, message);
        markTransactionFailed(message);
        return;
    }
    getStoreAdmin().deleteExistingStore(name);
    invalidatePathCache(name);
    slowMutatorWarned.delete(name);
    clearSsrGlobalAllowWarned(name);
}

export function resetStore<Name extends string, State>(name: StoreDefinition<Name, State>): WriteResult;
export function resetStore<Name extends string, State>(name: StoreKey<Name, State>): WriteResult;
export function resetStore<Name extends StoreName>(name: Name): WriteResult;
export function resetStore(nameInput: string | StoreDefinition<string, StoreValue>): WriteResult {
    const name = nameOf(nameInput);
    if (!exists(name)) return { ok: false, reason: "not-found" };
    const registry = getRegistry();
    const lazyPending = registry.metaEntries[name]?.options?.lazy === true && !!registry.initialFactories[name];
    if (lazyPending) {
        const message =
            `resetStore("${name}") cannot run on a lazy store before it is initialized. ` +
            `Read the store once (getStore) to materialize it before resetting.`;
        reportStoreWarning(name, message);
        if (isTransactionActive()) {
            markTransactionFailed(message);
        }
        return { ok: false, reason: "lazy-uninitialized" };
    }
    if (!materializeInitial(name, registry)) return { ok: false, reason: "validate" };
    if (!registry.initialStates[name]) {
        const message =
            `resetStore("${name}") has no initial state to reset to. ` +
            `If this is a lazy store, ensure it has been initialized before calling resetStore.`;
        reportStoreWarning(name, message);
        if (isTransactionActive()) {
            markTransactionFailed(message);
        }
        return { ok: false, reason: "not-found" };
    }
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : registry.stores[name];
    const resetValue = deepClone(registry.initialStates[name]);

    stageOrCommitUpdate(registry, {
        name,
        prev,
        next: resetValue,
        action: "reset",
        hookLabel: "onReset",
        logMessage: `Store "${name}" reset to initial state/value`,
    });
    return { ok: true };
}

const replaceStoreState = (
    registry: StoreRegistry,
    name: string,
    data: unknown,
    action: CommitAction = "hydrate",
    context?: WriteContext | null
): { ok: boolean; reason?: string } => {
    const fail = (reason: string, message?: string): { ok: false; reason: string } => {
        if (isTransactionActive()) {
            markTransactionFailed(message ?? reason);
        }
        return { ok: false, reason };
    };
    if (!exists(name)) {
        return fail("not-found", `replaceStore("${name}") called before createStore().`);
    }
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : getStoreValueRef(name, registry);
    const nextResult = sanitizeValue(name, data);
    if (!nextResult.ok) return fail("sanitize", `replaceStore("${name}") failed sanitize`);
    const nextValue = nextResult.value;
    if (nextValue === undefined) {
        const message = `Whole-store undefined replacement is blocked for "${name}". Use null for intentional empty state.`;
        reportStoreWarning(name, message);
        return fail("undefined", message);
    }

    const validateRule = registry.metaEntries[name]?.options?.validate;

    const writeContext = resolveWriteContext(context);
    const final = runMiddlewareForStore(name, {
        action,
        prev,
        next: nextValue,
        path: null,
        correlationId: writeContext?.correlationId,
        traceContext: writeContext?.traceContext,
    });
    if (final === MIDDLEWARE_ABORT) return fail("middleware", `replaceStore("${name}") aborted by middleware`);
    const committed = normalizeCommittedState(name, final, validateRule);
    if (!committed.ok) return fail("validate", `replaceStore("${name}") failed validation`);
    stageOrCommitUpdate(registry, {
        name,
        prev,
        next: committed.value,
        action,
        hookLabel: "onSet",
        logMessage: `Store "${name}" ${action === "hydrate" ? "hydrated" : "replaced"}`,
        context: writeContext,
    });
    return { ok: true };
};

export const clearAllStores = (): void => {
    if (isTransactionActive()) {
        const message = `clearAllStores() cannot be called inside setStoreBatch.`;
        warn(message);
        markTransactionFailed(message);
        return;
    }
    getStoreAdmin().clearAllStores();
    slowMutatorWarned.clear();
    clearSsrGlobalAllowWarned();
};

export const _hardResetAllStoresForTest = (): void => {
    runTestResets();
};

export const hydrateStores = <Snapshot extends object = HydrateSnapshot>(
    snapshot: Snapshot,
    options: HydrateOptions<Snapshot> = {},
    trust: HydrationTrust<Snapshot>
): { hydrated: string[]; created: string[]; failed: Record<string, string> } => {
    if (isTransactionActive()) {
        const message = `hydrateStores(...) cannot be called inside setStoreBatch.`;
        warn(message);
        markTransactionFailed(message);
        return {
            hydrated: [],
            created: [],
            failed: { _batch: "transaction" },
        };
    }
    const result = {
        hydrated: [] as string[],
        created: [] as string[],
        failed: Object.create(null) as Record<string, string>,
    };
    if (!snapshot || typeof snapshot !== "object") return result;
    const registry = getRegistry();

    const trustInput = trust ?? {};
    const allowHydration =
        trustInput.allowTrusted === true ||
        trustInput.allowHydration === true ||
        trustInput.allowUntrusted === true ||
        getConfig().allowUntrustedHydration === true;
    if (!allowHydration) {
        warnAlways(
            `hydrateStores(...) requires explicit trust. ` +
            `Pass { allowTrusted: true } (or { allowHydration: true }) as the third argument ` +
            `or configureStroid({ allowTrustedHydration: true }).`
        );
        result.failed._hydration = "untrusted";
        return result;
    }
    if (typeof trustInput.validate === "function") {
        let ok = false;
        try {
            ok = !!trustInput.validate(snapshot);
        } catch (err) {
            const errorMessage =
                `hydrateStores() trust.validate threw: ${(err as { message?: string })?.message ?? err}`;
            if (isDev()) {
                throw new Error(
                    `hydrateStores() trust.validate threw an error. ` +
                    `Fix your validator before this becomes a silent production failure.\n` +
                    `Original error: ${(err as { message?: string })?.message ?? err}`
                );
            }
            const onError = options?.default?.onError;
            if (typeof onError === "function") {
                try {
                    onError(errorMessage);
                } catch (hookErr) {
                    warnAlways(
                        `hydrateStores(...) onError threw: ${(hookErr as { message?: string })?.message ?? hookErr}`
                    );
                }
            }
            warnAlways(errorMessage);
            if (typeof trustInput.onValidationError === "function") {
                try {
                    const allow = !!trustInput.onValidationError(err, snapshot);
                    if (allow) {
                        ok = true;
                    } else {
                        result.failed._hydration = "validation-error";
                        return result;
                    }
                } catch (hookErr) {
                    warnAlways(
                        `hydrateStores(...) onValidationError threw: ${(hookErr as { message?: string })?.message ?? hookErr}`
                    );
                    result.failed._hydration = "validation-error";
                    return result;
                }
            } else {
                result.failed._hydration = "validation-error";
                return result;
            }
        }
        if (!ok) {
            warnAlways("hydrateStores(...) rejected by trust validation.");
            result.failed._hydration = "validation-failed";
            return result;
        }
    }
    Object.entries(snapshot).forEach(([storeName, data]) => {
        if (!isValidStoreName(storeName)) {
            result.failed[storeName] = "invalid-name";
            return;
        }
        if (hasStoreEntryInternal(storeName, registry)) {
            const res = replaceStoreState(registry, storeName, data, "hydrate");
            if (!res.ok) result.failed[storeName] = res.reason ?? "hydrate-failed";
            else result.hydrated.push(storeName);
        } else {
            const optionMap = options as Record<string, StoreOptions<any>> & { default?: StoreOptions<any> };
            const created = createStore(storeName, data, optionMap[storeName] || optionMap.default || {});
            if (created) result.created.push(storeName);
            else result.failed[storeName] = "create-failed";
        }
    });
    return result;
};

export { useRegistry } from "./store-lifecycle/bind.js";


