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
    produceClone,
    type PathInput,
} from "./utils.js";
import {
    collectLegacyOptionDeprecationWarnings,
    normalizeStoreOptions,
    type StoreOptions,
} from "./adapters/options.js";
import {
    stores,
    meta,
    subscribers,
    initialStates,
    initialFactories,
    storeAdmin,
    setStoreValueInternal,
    getStoreValueRef,
    hasStoreEntryInternal,
} from "./store-lifecycle/registry.js";
import {
    sanitizeValue,
    normalizeCommittedState,
    validatePathSafety,
    invalidatePathCache,
    materializeInitial,
} from "./store-lifecycle/validation.js";
import {
    runFeatureCreateHooks,
    runFeatureWriteHooks,
    runMiddlewareForStore,
    runStoreHookSafe,
    resolveFeatureAvailability,
} from "./store-lifecycle/hooks.js";
import {
    nameOf,
    exists,
    reportStoreCreationError,
    reportStoreError,
    reportStoreWarning,
    getSsrWarningIssued,
    markSsrWarningIssued,
} from "./store-lifecycle/identity.js";
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
import { getConfig } from "./internals/config.js";
import { runTestResets } from "./internals/test-reset.js";
import { notify } from "./store-notify.js";
import { MIDDLEWARE_ABORT } from "./features/lifecycle.js";
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
type StorePathFor<Name extends StoreName> =
    IsStoreNameLoose extends true ? string | string[] : Path<StateFor<Name>>;
type StorePathValueFor<Name extends StoreName, P extends StorePathFor<Name>> =
    IsStoreNameLoose extends true ? unknown : (P extends Path<StateFor<Name>> ? PathValue<StateFor<Name>, P> : never);
type HydrateSnapshot = Partial<{ [K in StoreName]: StateFor<K> }>;
type HydrateOptions<Snapshot extends Record<string, unknown>> =
    Partial<{ [K in keyof Snapshot]: StoreOptions<Snapshot[K]> }> & { default?: StoreOptions };
type HydrationTrust<Snapshot extends Record<string, unknown>> = {
    allowUntrusted?: boolean;
    validate?: (snapshot: Snapshot) => boolean;
};

const SLOW_MUTATOR_WARN_MS = 32;
const slowMutatorWarned = new Set<string>();
const ssrGlobalAllowWarned = new Set<string>();
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
};

const commitStoreUpdate = ({ name, prev, next, action, hookLabel, logMessage }: CommitArgs): void => {
    setStoreValueInternal(name, next);
    invalidatePathCache(name);
    const updatedAtMs = Date.now();
    meta[name].updatedAt = new Date(updatedAtMs).toISOString();
    meta[name].updatedAtMs = updatedAtMs;
    meta[name].updateCount++;
    runFeatureWriteHooks(name, action, prev, next, notify);
    runStoreHookSafe(name, hookLabel, meta[name].options[hookLabel], [prev, next]);
    notify(name);
    log(logMessage);
};

const stageOrCommitUpdate = (args: CommitArgs): void => {
    if (isTransactionActive()) {
        stageTransactionValue(args.name, args.next);
        registerTransactionCommit(() => commitStoreUpdate(args));
        return;
    }
    commitStoreUpdate(args);
};

export const createStore = <Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> | undefined => {
    if (isTransactionActive()) {
        const message =
            `createStore("${String(name)}") cannot be called inside setStoreBatch. ` +
            `Move createStore outside the batch to preserve transaction semantics.`;
        reportStoreCreationError(message, option.onError as ((message: string) => void) | undefined);
        markTransactionFailed(message);
        return;
    }
    if (!isValidStoreName(name)) {
        reportStoreCreationError(`createStore("${String(name)}") is not a valid store name.`, option.onError as ((message: string) => void) | undefined);
        return;
    }
    const lazyRequested = option.lazy === true && typeof initialData === "function";
    if (!lazyRequested && !isValidData(initialData)) {
        reportStoreCreationError(`createStore("${name}") received invalid initial data.`, option.onError as ((message: string) => void) | undefined);
        return;
    }
    if (initialData === undefined && isDev()) {
        warn(
            `createStore("${name}") received an undefined initial value. This can be indistinguishable from a missing store in some consumers; consider null or an explicit shape if that is intentional.`
        );
    }

    collectLegacyOptionDeprecationWarnings(option).forEach((message) => {
        warn(message);
    });

    const normalizedOptions = resolveFeatureAvailability(
        name,
        normalizeStoreOptions(option, name, getConfig().defaultSnapshotMode)
    );

    if (normalizedOptions.scope === "temp" && option.persist) {
        const message =
            `Store "${name}" has scope: "temp" but persist is enabled. ` +
            `Temp stores are intended to be ephemeral.`;
        normalizedOptions.onError?.(message);
        if (!isDev()) warnAlways(message);
        error(message);
    }

    const isServer = typeof window === "undefined";
    const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
    const isProdServer = isServer && nodeEnv === "production";
    const allowGlobalSSR = normalizedOptions.allowSSRGlobalStore ?? false;

    if (isProdServer && !allowGlobalSSR) {
        const msg =
            `createStore("${name}") is blocked on the server in production to prevent cross-request memory leaks.\n` +
            `Call createStoreForRequest(...) inside each request scope or pass { scope: "global" } to opt in.`;
        reportStoreCreationError(msg, option.onError as ((message: string) => void) | undefined);
        return;
    }
    if (isProdServer && allowGlobalSSR && !ssrGlobalAllowWarned.has(name)) {
        ssrGlobalAllowWarned.add(name);
        warnAlways(
            `createStore("${name}") is allowed on the server in production because allowSSRGlobalStore is true.\n` +
            `This can leak data across concurrent requests. Prefer createStoreForRequest(...) or scope: "request" unless you truly need a global SSR store.`
        );
    }

    if (hasStoreEntryInternal(name)) {
        const msg = `Store "${name}" already exists. Call setStore("${name}", data) to update instead.`;
        reportStoreWarning(name, msg);
        return { name } as StoreDefinition<Name, State>;
    }

    if (isServer && !allowGlobalSSR && !getSsrWarningIssued(name) && isDev()) {
        markSsrWarningIssued(name);
        warn(
            `createStore(\"${name}\") called in a server environment. ` +
            `Use createStoreForRequest(...) per request to avoid cross-request leaks ` +
            `or pass { allowSSRGlobalStore: true } if you really want a global store on the server.`
        );
    }

    const cleanResult = sanitizeValue(name, initialData, normalizedOptions.onError);
    if (!cleanResult.ok) return;
    const clean = cleanResult.value;
    const isLazy = normalizedOptions.lazy === true && typeof initialData === "function";

    const hadPreexistingSubscribers = (subscribers[name]?.size ?? 0) > 0;
    if (isLazy) {
        stores[name] = undefined;
        initialFactories[name] = initialData as () => unknown;
    } else {
        const validated = normalizeCommittedState(name, clean, normalizedOptions.validate, normalizedOptions.onError);
        if (!validated.ok) return;
        setStoreValueInternal(name, validated.value);
        initialStates[name] = deepClone(validated.value);
    }
    const createdAtMs = Date.now();
    const createdAtIso = new Date(createdAtMs).toISOString();
    meta[name] = {
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        updatedAtMs: createdAtMs,
        updateCount: 0,
        version: normalizedOptions.version,
        metrics: { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
        options: normalizedOptions,
    };

    invalidatePathCache(name);
    runFeatureCreateHooks(name, notify);
    runStoreHookSafe(name, "onCreate", meta[name].options.onCreate, [clean]);
    if (hadPreexistingSubscribers) notify(name);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return { name } as StoreDefinition<Name, State>;
};

export const createStoreStrict = <Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> => {
    const created = createStore(name, initialData, option);
    if (created) return created;
    throw new Error(
        `createStoreStrict("${String(name)}") failed. ` +
        `See earlier warnings/errors or onError callbacks for the cause.`
    );
};

export function setStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P, value: PathValue<State, P>): WriteResult;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, mutator: (draft: State) => void): WriteResult;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, data: PartialDeep<State>): WriteResult;
export function setStore<Name extends string, State, P extends Path<State>>(name: StoreKey<Name, State>, path: P, value: PathValue<State, P>): WriteResult;
export function setStore<Name extends string, State>(name: StoreKey<Name, State>, mutator: (draft: State) => void): WriteResult;
export function setStore<Name extends string, State>(name: StoreKey<Name, State>, data: PartialDeep<State>): WriteResult;
export function setStore<Name extends StoreName, P extends StorePathFor<Name>>(
    name: Name,
    path: P,
    value: StorePathValueFor<Name, P>
): WriteResult;
export function setStore<Name extends StoreName>(name: Name, mutator: (draft: StateFor<Name>) => void): WriteResult;
export function setStore<Name extends StoreName>(name: Name, data: PartialDeep<StateFor<Name>>): WriteResult;
export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): WriteResult {
    const storeName = nameOf(name);
    if (!materializeInitial(storeName)) return { ok: false, reason: "validate" };
    if (!hasStoreEntryInternal(storeName)) {
        const message =
            `setStore("${storeName}") called before createStore(). ` +
            `Create the store first or pass a valid StoreDefinition.`;
        reportStoreError(storeName, message);
        if (isTransactionActive()) markTransactionFailed(message);
        return { ok: false, reason: "not-found" };
    }
    let updated: StoreValue;
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(storeName) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : getStoreValueRef(storeName);

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
            meta[storeName]?.options?.onError?.(safePath.reason ?? `Invalid path for "${storeName}".`);
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
        meta[storeName]?.options?.onError?.(message);
        if (isTransactionActive()) markTransactionFailed(message);
        return { ok: false, reason: "invalid-args" };
    }

    if (!isValidData(updated)) {
        if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") produced invalid data`);
        return { ok: false, reason: "validate" };
    }
    const validateRule = meta[storeName]?.options?.validate;

    const next = runMiddlewareForStore(storeName, { action: "set", prev, next: updated, path: keyOrData });
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

    stageOrCommitUpdate({
        name: storeName,
        prev,
        next: committed.value,
        action: "set",
        hookLabel: "onSet",
        logMessage: `Store "${storeName}" updated`,
    });
    return { ok: true };
}

export function replaceStore<Name extends string, State>(name: StoreDefinition<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends string, State>(name: StoreKey<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends StoreName>(name: Name, value: StateFor<Name>): WriteResult;
export function replaceStore(nameInput: string | StoreDefinition<string, StoreValue>, value: unknown): WriteResult {
    if (isTransactionActive()) {
        const message = `replaceStore(...) cannot be called inside setStoreBatch.`;
        warn(message);
        markTransactionFailed(message);
        return { ok: false, reason: "invalid-args" };
    }
    const storeName = nameOf(nameInput);
    if (!storeName) return { ok: false, reason: "invalid-args" };

    const result = replaceStoreState(storeName, value, "replace");
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
    if (!materializeInitial(name)) return;
    if (isTransactionActive()) {
        const message =
            `deleteStore("${name}") cannot be called inside setStoreBatch. ` +
            `Move deleteStore outside the batch to preserve transaction semantics.`;
        reportStoreWarning(name, message);
        markTransactionFailed(message);
        return;
    }
    storeAdmin.deleteExistingStore(name);
    invalidatePathCache(name);
}

export function resetStore<Name extends string, State>(name: StoreDefinition<Name, State>): WriteResult;
export function resetStore<Name extends string, State>(name: StoreKey<Name, State>): WriteResult;
export function resetStore<Name extends StoreName>(name: Name): WriteResult;
export function resetStore(nameInput: string | StoreDefinition<string, StoreValue>): WriteResult {
    const name = nameOf(nameInput);
    if (!exists(name)) return { ok: false, reason: "not-found" };
    if (!materializeInitial(name)) return { ok: false, reason: "validate" };
    if (!initialStates[name]) {
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
    const prev = stagedPrev.has ? stagedPrev.value : stores[name];
    const resetValue = deepClone(initialStates[name]);

    stageOrCommitUpdate({
        name,
        prev,
        next: resetValue,
        action: "reset",
        hookLabel: "onReset",
        logMessage: `Store "${name}" reset to initial state/value`,
    });
    return { ok: true };
}

const replaceStoreState = (name: string, data: unknown, action: CommitAction = "hydrate"): { ok: boolean; reason?: string } => {
    if (!exists(name)) return { ok: false, reason: "not-found" };
    const prev = stores[name];
    const nextResult = sanitizeValue(name, data);
    if (!nextResult.ok) return { ok: false, reason: "sanitize" };
    const nextValue = nextResult.value;
    if (nextValue === undefined) {
        const message = `Whole-store undefined replacement is blocked for "${name}". Use null for intentional empty state.`;
        reportStoreWarning(name, message);
        return { ok: false, reason: "undefined" };
    }

    const validateRule = meta[name]?.options?.validate;

    const final = runMiddlewareForStore(name, { action, prev, next: nextValue, path: null });
    if (final === MIDDLEWARE_ABORT) return { ok: false, reason: "middleware" };
    const committed = normalizeCommittedState(name, final, validateRule);
    if (!committed.ok) return { ok: false, reason: "validate" };
    commitStoreUpdate({
        name,
        prev,
        next: committed.value,
        action,
        hookLabel: "onSet",
        logMessage: `Store "${name}" ${action === "hydrate" ? "hydrated" : "replaced"}`,
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
    storeAdmin.clearAllStores();
};

export const _hardResetAllStoresForTest = (): void => {
    runTestResets();
};

export const hydrateStores = <Snapshot extends Record<string, unknown> = HydrateSnapshot>(
    snapshot: Snapshot,
    options: HydrateOptions<Snapshot> = {},
    trust: HydrationTrust<Snapshot> = {}
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

    const allowUntrusted = trust.allowUntrusted === true || getConfig().allowUntrustedHydration === true;
    if (!allowUntrusted) {
        warnAlways(
            `hydrateStores(...) requires explicit trust. ` +
            `Pass { allowUntrusted: true } as the third argument or configureStroid({ allowUntrustedHydration: true }).`
        );
        result.failed._hydration = "untrusted";
        return result;
    }
    if (typeof trust.validate === "function") {
        let ok = false;
        try {
            ok = !!trust.validate(snapshot);
        } catch (err) {
            warnAlways(
                `hydrateStores(...) trust validation threw: ${(err as { message?: string })?.message ?? err}`
            );
            result.failed._hydration = "validation-error";
            return result;
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
        if (hasStoreEntryInternal(storeName)) {
            const res = replaceStoreState(storeName, data, "hydrate");
            if (!res.ok) result.failed[storeName] = res.reason ?? "hydrate-failed";
            else result.hydrated.push(storeName);
        } else {
            const optionMap = options as Record<string, StoreOptions> & { default?: StoreOptions };
            const created = createStore(storeName, data, optionMap[storeName] || optionMap.default || {});
            if (created) result.created.push(storeName);
            else result.failed[storeName] = "create-failed";
        }
    });
    return result;
};

export { useRegistry } from "./store-lifecycle/bind.js";


