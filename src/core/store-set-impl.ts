/**
 * @module store-set-impl
 *
 * LAYER: Store runtime
 * OWNS:  setStore implementation.
 *
 * Consumers: store-set.
 */
import {
    warn,
    error,
    isDev,
    isValidData,
    validateDepth,
    setByPath,
    deepClone,
    shallowEqual,
    type PathInput,
} from "../utils.js";
import { getConfig } from "../internals/config.js";
import {
    getStoreValueRef,
    hasStoreEntryInternal,
    getRegistry,
} from "./store-lifecycle/registry.js";
import {
    sanitizeValue,
    normalizeCommittedState,
    validatePathSafety,
    materializeInitial,
} from "./store-lifecycle/validation.js";
import { runMiddlewareForStore } from "./store-lifecycle/hooks.js";
import { nameOf, reportStoreError } from "./store-lifecycle/identity.js";
import type {
    PartialDeep,
    Path,
    PathValue,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    WriteResult,
} from "./store-lifecycle/types.js";
import { MIDDLEWARE_ABORT } from "../features/lifecycle.js";
import type { WriteContext } from "../internals/write-context.js";
import {
    isTransactionActive,
    getStagedTransactionValue,
    markTransactionFailed,
} from "./store-transaction.js";
import {
    maybeWarnSlowMutator,
    resolveWriteContext,
    stageOrCommitUpdate,
} from "./store-write-shared.js";

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

export function setStore<T extends StoreTarget, P extends StorePathForTarget<T>>(
    name: T,
    path: P,
    value: StorePathValueForTarget<T, P>
): WriteResult;
export function setStore<T extends StoreTarget>(
    name: T,
    update: StoreUpdateForTarget<T>
): WriteResult;
export function setStore(
    name: string | StoreDefinition<string, StoreValue>,
    keyOrData: KeyOrData,
    value?: unknown
): WriteResult {
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
                maybeWarnSlowMutator(storeName, Date.now() - mutatorStart);
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

    // Short-circuit: if the committed state is shallow-equal to the previous state, avoid notifying subscribers.
    try {
        if (shallowEqual(prev, committed.value)) {
            // No change from a shallow perspective; skip notifications and return success.
            return { ok: true };
        }
    } catch (err) {
        // If shallowEqual throws for any reason, fall back to normal flow.
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
