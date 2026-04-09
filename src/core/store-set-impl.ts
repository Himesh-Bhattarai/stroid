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
    parsePath,
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
import { safeInvoke } from "../internals/reporting.js";
import type { WriteContext } from "../internals/write-context.js";
import {
    isTransactionActive,
    getStagedTransactionValue,
    markTransactionFailed,
} from "./store-transaction.js";
import {
    createCanonicalSetStorePatches,
    type SetStorePatchIntent,
} from "./runtime-patch.js";
import {
    maybeWarnSlowMutator,
    resolveWriteContext,
    stageOrCommitUpdate,
} from "./store-write-shared.js";
import {
    enqueueHydrationWrite,
    shouldQueueHydrationWrite,
} from "./hydration-consistency.js";

type KeyOrData = StoreValue | string | string[] | Record<string, unknown> | ((draft: StoreValue) => void);
// If store names are loose (not registered via StoreStateMap), fall back to untyped paths/values.
export type IsStoreNameLoose = string extends StoreName ? true : false;
export type StoreUpdate<State> = State | Partial<State> | PartialDeep<State> | ((draft: State) => void);
export type StoreTarget<Name extends string = string, State = StoreValue> =
    | StoreDefinition<Name, State>
    | StoreKey<Name, State>
    | StoreName;
export type StoreStateForTarget<T> =
    T extends StoreDefinition<infer _Name extends string, infer S> ? S
        : T extends StoreKey<infer _Name extends string, infer S> ? S
            : (T extends StoreName ? StateFor<T> : StoreValue);
export type StorePathForTarget<T> =
    T extends StoreDefinition<infer _Name extends string, infer S> ? Path<S>
        : T extends StoreKey<infer _Name extends string, infer S> ? Path<S>
            : (IsStoreNameLoose extends true ? string | string[] : (T extends StoreName ? Path<StateFor<T>> : string | string[]));
export type StorePathValueForTarget<T, P> =
    T extends StoreDefinition<infer _Name extends string, infer S>
        ? (P extends Path<S> ? PathValue<S, P> : never)
        : T extends StoreKey<infer _Name extends string, infer S>
            ? (P extends Path<S> ? PathValue<S, P> : never)
            : (IsStoreNameLoose extends true ? unknown : (T extends StoreName ? (P extends Path<StateFor<T>> ? PathValue<StateFor<T>, P> : never) : unknown));
export type StoreUpdateForTarget<T> =
    T extends StoreDefinition<infer _Name extends string, infer S> ? StoreUpdate<S>
        : T extends StoreKey<infer _Name extends string, infer S> ? StoreUpdate<S>
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
    context?: WriteContext | null,
    bypassHydrationQueue = false
): WriteResult => {
    const storeName = nameOf(name);
    const registry = getRegistry();
    const registryMeta = registry.metaEntries;
    const config = getConfig();
    const txActive = isTransactionActive();
    const failTx = (reason: unknown): void => {
        if (txActive) markTransactionFailed(reason);
    };
    if (!materializeInitial(storeName, registry)) return { ok: false, reason: "validate" };
    if (!hasStoreEntryInternal(storeName, registry)) {
        const message =
            `setStore("${storeName}") called before createStore(). ` +
            `Create the store first or pass a valid StoreDefinition.`;
        reportStoreError(storeName, message);
        failTx(message);
        return { ok: false, reason: "not-found" };
    }
    const sourceHint = context?.sourceHint ?? "effect";
    if (!bypassHydrationQueue && shouldQueueHydrationWrite(registry, storeName, sourceHint)) {
        enqueueHydrationWrite(registry, storeName, sourceHint, () => {
            setStoreInternal(name, keyOrData, value, context, true);
        });
        return { ok: true };
    }
    let updated: StoreValue;
    let runtimePatchIntent: SetStorePatchIntent = { kind: "root" };
    let prev = getStoreValueRef(storeName, registry);
    if (txActive) {
        const stagedPrev = getStagedTransactionValue(storeName);
        if (stagedPrev.has) prev = stagedPrev.value;
    }

    const usedMutator = typeof keyOrData === "function" && value === undefined;

    if (usedMutator) {
        const mutatorStart = isDev() ? Date.now() : 0;
        try {
            const producer = config.mutatorProduce;
            let didReturn = false;
            let returnedValue: unknown = undefined;
            const strictMutatorReturns = config.strictMutatorReturns;
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
            if (didReturn && strictMutatorReturns) {
                const message =
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Strict mutator mode forbids return values; mutate the draft instead.`;
                reportStoreError(storeName, message);
                failTx(message);
                return { ok: false, reason: "validate" };
            }
            if (didReturn && isDev() && !strictMutatorReturns) {
                warn(
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Return values replace the entire store; return void to apply draft mutations instead.`
                );
            }
            updated = (didReturn && !strictMutatorReturns)
                ? (returnedValue as StoreValue)
                : (draft as StoreValue);
            runtimePatchIntent = { kind: "root" };
        } catch (err) {
            reportStoreError(storeName, `Mutator for "${storeName}" failed: ${(err as { message?: string })?.message ?? err}`);
            failTx(err);
            return { ok: false, reason: "validate" };
        } finally {
            if (mutatorStart) {
                maybeWarnSlowMutator(storeName, Date.now() - mutatorStart);
            }
        }
    } else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) {
            failTx(`setStore("${storeName}") received invalid data`);
            return { ok: false, reason: "invalid-args" };
        }
        if (typeof prev !== "object" || prev === null || Array.isArray(prev)) {
            error(
                `setStore("${storeName}", data) only merges into object stores.\n` +
                `Use setStore("${storeName}", "path", value) or recreate the store with an object shape.`
            );
            failTx(`setStore("${storeName}") attempted object merge on non-object store`);
            return { ok: false, reason: "validate" };
        }
        const partialResult = sanitizeValue(storeName, keyOrData);
        if (!partialResult.ok) {
            failTx(`setStore("${storeName}") failed sanitize`);
            return { ok: false, reason: "validate" };
        }
        updated = Object.assign({}, prev as Record<string, unknown>, partialResult.value as Record<string, unknown>);
        runtimePatchIntent = { kind: "merge", value: partialResult.value };
    } else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        const parsedPath = parsePath(keyOrData as PathInput);
        if (!validateDepth(parsedPath)) {
            failTx(`setStore("${storeName}") received invalid path`);
            return { ok: false, reason: "invalid-args" };
        }
        const valueResult = sanitizeValue(storeName, value);
        if (!valueResult.ok) {
            failTx(`setStore("${storeName}") failed sanitize`);
            return { ok: false, reason: "validate" };
        }
        const sanitizedValue = valueResult.value;
        const safePath = validatePathSafety(storeName, prev, parsedPath, sanitizedValue);
        if (!safePath.ok) {
            safeInvoke(
                registryMeta[storeName]?.options?.onError,
                `onError(${storeName})`,
                safePath.reason ?? `Invalid path for "${storeName}".`
            );
            failTx(safePath.reason);
            return { ok: false, reason: "path" };
        }
        updated = setByPath(prev as Record<string, unknown>, parsedPath, sanitizedValue);
        runtimePatchIntent = {
            kind: "path",
            path: parsedPath,
            value: sanitizedValue,
        };
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
        safeInvoke(registryMeta[storeName]?.options?.onError, `onError(${storeName})`, message);
        failTx(message);
        return { ok: false, reason: "invalid-args" };
    }

    if (!isValidData(updated)) {
        failTx(`setStore("${storeName}") produced invalid data`);
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
        failTx(`setStore("${storeName}") aborted by middleware`);
        return { ok: false, reason: "middleware" };
    }
    const reuseInput = Object.is(next, updated);
    const committed = normalizeCommittedState(storeName, next, validateRule, undefined, reuseInput ? { reuseInput: true } : undefined);
    if (!committed.ok) {
        failTx(`setStore("${storeName}") failed validation`);
        return { ok: false, reason: "validate" };
    }
    const runtimePatches = createCanonicalSetStorePatches({
        store: storeName,
        intent: runtimePatchIntent,
        committedValue: committed.value,
        preserveIntent:
            runtimePatchIntent.kind !== "root"
            && Object.is(next, updated)
            && Object.is(committed.value, next),
        context: writeContext,
    });

    // Short-circuit: if the committed state is shallow-equal to the previous state, avoid notifying subscribers.
    if (Object.is(prev, committed.value)) {
        return { ok: true };
    }
    try {
        if (shallowEqual(prev, committed.value)) {
            // No change from a shallow perspective; skip notifications and return success.
            return { ok: true };
        }
    } catch (err) {
        // If shallowEqual throws, fall back to normal flow.
    }

    stageOrCommitUpdate(registry, {
        name: storeName,
        prev,
        next: committed.value,
        action: "set",
        hookLabel: "onSet",
        logMessage: `Store "${storeName}" updated`,
        context: writeContext,
        runtimePatches,
        normalizeHydrationCandidate: (candidate) =>
            normalizeCommittedState(storeName, candidate, validateRule),
    });
    return { ok: true };
};

export const setStoreWithContext = (
    name: string | StoreDefinition<string, StoreValue>,
    keyOrData: KeyOrData,
    value: unknown,
    context: WriteContext | null
): WriteResult => setStoreInternal(name, keyOrData, value, context);
