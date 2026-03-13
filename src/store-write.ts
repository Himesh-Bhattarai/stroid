/**
 * @module store-write
 *
 * LAYER: Public Write API
 * OWNS:  createStore(), setStore(), deleteStore(), resetStore(),
 *        hydrateStores(), clearAllStores().
 *
 * DOES NOT KNOW about: React hooks, async caching, or feature internals.
 * Delegates all engine work to store-lifecycle.
 *
 * Consumers: index.ts, core.ts, testing.ts, server.ts.
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
    resetLegacyOptionDeprecationWarningsForTests,
    type StoreOptions,
} from "./adapters/options.js";
import {
    // ── Registry state ─────────────────────────────────────────────────────
    stores, meta, subscribers,
    initialStates, initialFactories,
    clearPathValidationCache,
    storeAdmin, bindRegistry, defaultRegistryScope,
    // ── Validation ─────────────────────────────────────────────────────────
    sanitizeValue, normalizeCommittedState,
    validatePathSafety, invalidatePathCache, materializeInitial,
    // ── Lifecycle hooks ─────────────────────────────────────────────────────
    runFeatureCreateHooks, runFeatureWriteHooks, runFeatureDeleteHooks,
    runMiddlewareForStore, runStoreHookSafe,
    setStoreValueInternal, getStoreValueRef, resolveFeatureAvailability,
    // ── Identity & existence ────────────────────────────────────────────────
    nameOf, exists, hasStoreEntryInternal,
    reportStoreCreationError, reportStoreError, reportStoreWarning,
    getSsrWarningIssued, markSsrWarningIssued, resetSsrWarningFlag,
    clearFeatureContexts, clearAllRegistries, resetFeaturesForTests,
    // ── Types ───────────────────────────────────────────────────────────────
    type PartialDeep, type Path, type PathValue,
    type StoreDefinition, type StoreValue, type StoreKey,
    type StoreName, type StateFor, type WriteResult,
    type UnregisteredStoreName,
} from "./store-lifecycle.js";
import { resetBroadUseStoreWarnings, resetMissingUseStoreWarnings } from "./internals/hooks-warnings.js";
import { getConfig, resetConfig } from "./internals/config.js";
import { clearRegistryScopeOverrideForTests } from "./store-registry.js";
import { notify, resetNotifyStateForTests } from "./store-notify.js";
import { MIDDLEWARE_ABORT } from "./features/lifecycle.js";
import {
    isTransactionActive,
    getStagedTransactionValue,
    stageTransactionValue,
    registerTransactionCommit,
    markTransactionFailed,
} from "./store-transaction.js";

type KeyOrData = string | string[] | Record<string, unknown> | ((draft: any) => void);

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

    const normalizedOptions = resolveFeatureAvailability(name, normalizeStoreOptions(option, name));

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
    meta[name] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

export function setStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P, value: PathValue<State, P>): WriteResult;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, mutator: (draft: State) => void): WriteResult;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, data: PartialDeep<State>): WriteResult;
export function setStore<Name extends string, State, P extends Path<State>>(name: StoreKey<Name, State>, path: P, value: PathValue<State, P>): WriteResult;
export function setStore<Name extends string, State>(name: StoreKey<Name, State>, mutator: (draft: State) => void): WriteResult;
export function setStore<Name extends string, State>(name: StoreKey<Name, State>, data: PartialDeep<State>): WriteResult;
export function setStore<Name extends StoreName, P extends Path<StateFor<Name>>>(name: Name, path: P, value: PathValue<StateFor<Name>, P>): WriteResult;
export function setStore<Name extends StoreName>(name: Name, mutator: (draft: StateFor<Name>) => void): WriteResult;
export function setStore<Name extends StoreName>(name: Name, data: PartialDeep<StateFor<Name>>): WriteResult;
export function setStore<Name extends string>(name: UnregisteredStoreName<Name>, data: Record<string, unknown>): WriteResult;
export function setStore<Name extends string>(name: UnregisteredStoreName<Name>, path: string | string[], value: unknown): WriteResult;
export function setStore<Name extends string>(name: UnregisteredStoreName<Name>, mutator: (draft: any) => void): WriteResult;
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

    if (typeof keyOrData === "function" && value === undefined) {
        try {
            const draft = deepClone(prev);
            const result = (keyOrData as (draft: any) => unknown)(draft);
            if (result !== undefined && getConfig().strictMutatorReturns) {
                const message =
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Strict mutator mode forbids return values; mutate the draft instead.`;
                reportStoreError(storeName, message);
                if (isTransactionActive()) markTransactionFailed(message);
                return { ok: false, reason: "validate" };
            }
            if (result !== undefined && isDev() && !getConfig().strictMutatorReturns) {
                warn(
                    `setStore("${storeName}", mutator) returned a value. ` +
                    `Return values replace the entire store; return void to apply draft mutations instead.`
                );
            }
            updated = result !== undefined ? result as StoreValue : draft as StoreValue;
        } catch (err) {
            reportStoreError(storeName, `Mutator for "${storeName}" failed: ${(err as { message?: string })?.message ?? err}`);
            if (isTransactionActive()) markTransactionFailed(err);
            return { ok: false, reason: "validate" };
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
            `  setStore(storeDef, draft => { draft.field = value })`;
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
    const committed = normalizeCommittedState(storeName, next, validateRule);
    if (!committed.ok) {
        if (isTransactionActive()) markTransactionFailed(`setStore("${storeName}") failed validation`);
        return { ok: false, reason: "validate" };
    }

    if (isTransactionActive()) {
        const nextValue = committed.value;
        const prevValue = prev;
        stageTransactionValue(storeName, nextValue);
        registerTransactionCommit(() => {
            setStoreValueInternal(storeName, nextValue);
            invalidatePathCache(storeName);
            meta[storeName].updatedAt = new Date().toISOString();
            meta[storeName].updateCount++;
            runFeatureWriteHooks(storeName, "set", prevValue, nextValue, notify);
            runStoreHookSafe(storeName, "onSet", meta[storeName].options.onSet, [prevValue, nextValue]);
            log(`Store "${storeName}" updated`);
        });
        notify(storeName);
    } else {
        setStoreValueInternal(storeName, committed.value);
        invalidatePathCache(storeName);
        meta[storeName].updatedAt = new Date().toISOString();
        meta[storeName].updateCount++;
        runFeatureWriteHooks(storeName, "set", prev, committed.value, notify);
        runStoreHookSafe(storeName, "onSet", meta[storeName].options.onSet, [prev, committed.value]);
        notify(storeName);
    }

    if (!isTransactionActive()) {
        log(`Store "${storeName}" updated`);
    }
    return { ok: true };
}

export function deleteStore<Name extends string, State>(name: StoreDefinition<Name, State>): void;
export function deleteStore<Name extends string, State>(name: StoreKey<Name, State>): void;
export function deleteStore<Name extends StoreName>(name: Name): void;
export function deleteStore<Name extends string>(name: UnregisteredStoreName<Name>): void;
export const deleteStore = (nameInput: string | StoreDefinition<string, StoreValue>): void => {
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
};

export function resetStore<Name extends string, State>(name: StoreDefinition<Name, State>): void;
export function resetStore<Name extends string, State>(name: StoreKey<Name, State>): void;
export function resetStore<Name extends StoreName>(name: Name): void;
export function resetStore<Name extends string>(name: UnregisteredStoreName<Name>): void;
export const resetStore = (nameInput: string | StoreDefinition<string, StoreValue>): void => {
    const name = nameOf(nameInput);
    if (!exists(name)) return;
    if (!materializeInitial(name)) return;
    if (!initialStates[name]) {
        const message =
            `resetStore("${name}") has no initial state to reset to. ` +
            `If this is a lazy store, ensure it has been initialized before calling resetStore.`;
        reportStoreWarning(name, message);
        if (isTransactionActive()) {
            markTransactionFailed(message);
        }
        return;
    }
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : stores[name];
    const resetValue = deepClone(initialStates[name]);

    if (isTransactionActive()) {
        stageTransactionValue(name, resetValue);
        registerTransactionCommit(() => {
            setStoreValueInternal(name, resetValue);
            invalidatePathCache(name);
            meta[name].updatedAt = new Date().toISOString();
            meta[name].updateCount++;
            runFeatureWriteHooks(name, "reset", prev, resetValue, notify);
            runStoreHookSafe(name, "onReset", meta[name].options.onReset, [prev, resetValue]);
            log(`Store "${name}" reset to initial state/value`);
        });
        notify(name);
        return;
    }

    setStoreValueInternal(name, resetValue);
    invalidatePathCache(name);
    meta[name].updatedAt = new Date().toISOString();
    meta[name].updateCount++;
    runFeatureWriteHooks(name, "reset", prev, resetValue, notify);
    runStoreHookSafe(name, "onReset", meta[name].options.onReset, [prev, resetValue]);
    notify(name);
    log(`Store "${name}" reset to initial state/value`);
};

const replaceStoreState = (name: string, data: unknown, action = "hydrate"): { ok: boolean; reason?: string } => {
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
    setStoreValueInternal(name, committed.value);
    meta[name].updatedAt = new Date().toISOString();
    meta[name].updateCount++;
    runFeatureWriteHooks(name, action, prev, committed.value, notify);
    runStoreHookSafe(name, "onSet", meta[name].options.onSet, [prev, committed.value]);
    notify(name);
    log(`Store "${name}" hydrated`);
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
    resetFeaturesForTests();
    clearAllRegistries();
    resetLegacyOptionDeprecationWarningsForTests();
    resetNotifyStateForTests();
    clearPathValidationCache();
    resetSsrWarningFlag();
    resetBroadUseStoreWarnings();
    resetMissingUseStoreWarnings();
    resetConfig();
    clearFeatureContexts();
    clearRegistryScopeOverrideForTests();
    bindRegistry(defaultRegistryScope);
};

export const hydrateStores = (
    snapshot: Record<string, any>,
    options: Partial<Record<string, StoreOptions>> & { default?: StoreOptions } = {}
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
            const created = createStore(storeName, data, options[storeName] || options.default || {});
            if (created) result.created.push(storeName);
            else result.failed[storeName] = "create-failed";
        }
    });
    return result;
};

export { useRegistry } from "./store-lifecycle.js";
