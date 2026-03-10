import {
    warn,
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
    clearAllRegistries,
    exists,
    initialFactories,
    initialStates,
    invalidatePathCache,
    materializeInitial,
    meta,
    nameOf,
    normalizeCommittedState,
    PartialDeep,
    type Path,
    pathValidationCache,
    type PathValue,
    type StoreDefinition,
    type StoreValue,
    type StoreKey,
    type StoreName,
    type StateFor,
    type WriteResult,
    reportStoreCreationError,
    reportStoreError,
    resolveFeatureAvailability,
    runFeatureCreateHooks,
    runFeatureWriteHooks,
    runMiddlewareForStore,
    runStoreHookSafe,
    sanitizeValue,
    setStoreValueInternal,
    stores,
    storeAdmin,
    getSsrWarningIssued,
    markSsrWarningIssued,
    resetSsrWarningFlag,
    resetFeaturesForTests,
    hasStoreEntryInternal,
    subscribers,
    clearFeatureContexts,
    validatePathSafety,
    bindRegistry,
    defaultRegistryScope,
} from "./store-lifecycle.js";
import { resetBroadUseStoreWarnings } from "./internals/hooks-warnings.js";
import { resetConfig } from "./internals/config.js";
import { setRegistryScope } from "./store-registry.js";
import { notify, resetNotifyStateForTests } from "./store-notify.js";
import { MIDDLEWARE_ABORT } from "./features/lifecycle.js";

type KeyOrData = string | string[] | Record<string, unknown> | ((draft: any) => void);

export const createStore = <Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreKey<Name, State> | undefined => {
    if (!isValidStoreName(name)) return;
    const lazyRequested = option.lazy === true && typeof initialData === "function";
    if (!lazyRequested && !isValidData(initialData)) return;
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
        warn(
            `Store "${name}" has scope: "temp" but persist is enabled. ` +
            `Temp stores are intended to be ephemeral.`
        );
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
        warn(msg);
        meta[name]?.options?.onError?.(msg);
        return { name } as StoreKey<Name, State>;
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

    const hadPreexistingSubscribers = !!subscribers[name]?.length;
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

    runFeatureCreateHooks(name, notify);
    runStoreHookSafe(name, "onCreate", meta[name].options.onCreate, [clean]);
    if (hadPreexistingSubscribers) notify(name);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return { name } as StoreKey<Name, State>;
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
export function setStore(name: string, data: Record<string, unknown>): WriteResult;
export function setStore(name: string, path: string | string[], value: unknown): WriteResult;
export function setStore(name: string, mutator: (draft: any) => void): WriteResult;
export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): WriteResult {
    const storeName = nameOf(name);
    if (!exists(storeName)) return { ok: false, reason: "not-found" };
    if (!materializeInitial(storeName)) return { ok: false, reason: "validate" };
    let updated: StoreValue;
    const prev = stores[storeName];

    if (typeof keyOrData === "function" && value === undefined) {
        try {
            updated = produceClone(prev, keyOrData as (draft: any) => void);
        } catch (err) {
            reportStoreError(storeName, `Mutator for "${storeName}" failed: ${(err as { message?: string })?.message ?? err}`);
            return { ok: false, reason: "middleware" };
        }
    } else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) return { ok: false, reason: "invalid-args" };
        if (typeof prev !== "object" || prev === null || Array.isArray(prev)) {
            error(
                `setStore("${storeName}", data) only merges into object stores.\n` +
                `Use setStore("${storeName}", "path", value) or recreate the store with an object shape.`
            );
            return { ok: false, reason: "validate" };
        }
        const partialResult = sanitizeValue(storeName, keyOrData);
        if (!partialResult.ok) return { ok: false, reason: "validate" };
        updated = { ...(prev as Record<string, unknown>), ...partialResult.value as Record<string, unknown> };
    } else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData as PathInput)) return { ok: false, reason: "invalid-args" };
        const valueResult = sanitizeValue(storeName, value);
        if (!valueResult.ok) return { ok: false, reason: "validate" };
        const sanitizedValue = valueResult.value;
        const safePath = validatePathSafety(storeName, prev, keyOrData as PathInput, sanitizedValue);
        if (!safePath.ok) {
            meta[storeName]?.options?.onError?.(safePath.reason ?? `Invalid path for "${storeName}".`);
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
        return { ok: false, reason: "invalid-args" };
    }

    if (!isValidData(updated)) return { ok: false, reason: "validate" };
    const validateRule = meta[storeName]?.options?.validate;

    const next = runMiddlewareForStore(storeName, { action: "set", prev, next: updated, path: keyOrData });
    if (next === MIDDLEWARE_ABORT) return { ok: false, reason: "middleware" };
    const committed = normalizeCommittedState(storeName, next, validateRule);
    if (!committed.ok) return { ok: false, reason: "validate" };
    setStoreValueInternal(storeName, committed.value);
    invalidatePathCache(storeName);
    meta[storeName].updatedAt = new Date().toISOString();
    meta[storeName].updateCount++;
    runFeatureWriteHooks(storeName, "set", prev, committed.value, notify);
    runStoreHookSafe(storeName, "onSet", meta[storeName].options.onSet, [prev, committed.value]);
    notify(storeName);

    log(`Store "${storeName}" updated`);
    return { ok: true };
}

export const deleteStore = (name: string): void => {
    if (!exists(name)) return;
    if (!materializeInitial(name)) return;
    storeAdmin.deleteExistingStore(name);
    invalidatePathCache(name);
};

export const resetStore = (name: string): void => {
    if (!exists(name)) return;
    if (!materializeInitial(name)) return;
    if (!initialStates[name]) return;
    const prev = stores[name];
    const resetValue = deepClone(initialStates[name]);
    setStoreValueInternal(name, resetValue);
    invalidatePathCache(name);
    meta[name].updatedAt = new Date().toISOString();
    meta[name].updateCount++;
    runFeatureWriteHooks(name, "reset", prev, resetValue, notify);
    runStoreHookSafe(name, "onReset", meta[name].options.onReset, [prev, resetValue]);
    notify(name);
    log(`Store "${name}" reset to initial state/value`);
};

export const mergeStore = (name: string, data: Record<string, unknown>): WriteResult => {
    if (!exists(name)) return { ok: false, reason: "not-found" } as WriteResult;
    if (!materializeInitial(name)) return { ok: false, reason: "validate" } as WriteResult;
    if (!isValidData(data)) return { ok: false, reason: "validate" } as WriteResult;
    const current = stores[name];
    if (typeof current !== "object" || Array.isArray(current) || current === null) {
        error(
            `mergeStore("${name}") only works on object stores.\n` +
            `Use setStore("${name}", value) instead.`
        );
        return { ok: false, reason: "validate" } as WriteResult;
    }
    const mergeResult = sanitizeValue(name, data);
    if (!mergeResult.ok) return { ok: false, reason: "validate" } as WriteResult;
    const next = { ...(current as Record<string, unknown>), ...mergeResult.value as Record<string, unknown> };

    const validateRule = meta[name]?.options?.validate;

    const final = runMiddlewareForStore(name, { action: "merge", prev: current, next, path: null });
    if (final === MIDDLEWARE_ABORT) return { ok: false, reason: "middleware" } as WriteResult;
    const committed = normalizeCommittedState(name, final, validateRule);
    if (!committed.ok) return { ok: false, reason: "validate" } as WriteResult;
    setStoreValueInternal(name, committed.value);
    invalidatePathCache(name);
    meta[name].updatedAt = new Date().toISOString();
    meta[name].updateCount++;
    runFeatureWriteHooks(name, "merge", current, committed.value, notify);
    runStoreHookSafe(name, "onSet", meta[name].options.onSet, [current, committed.value]);
    notify(name);
    log(`Store "${name}" merged with data`);
    return { ok: true } as WriteResult;
};

const replaceStoreState = (name: string, data: unknown, action = "hydrate"): { ok: boolean; reason?: string } => {
    if (!exists(name)) return { ok: false, reason: "not-found" };
    const prev = stores[name];
    const nextResult = sanitizeValue(name, data);
    if (!nextResult.ok) return { ok: false, reason: "sanitize" };
    const nextValue = nextResult.value;
    if (nextValue === undefined) {
        const message = `Whole-store undefined replacement is blocked for "${name}". Use null for intentional empty state.`;
        meta[name]?.options?.onError?.(message);
        warn(message);
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
    storeAdmin.clearAllStores();
};

export const _hardResetAllStoresForTest = (): void => {
    resetFeaturesForTests();
    clearAllRegistries();
    resetLegacyOptionDeprecationWarningsForTests();
    resetNotifyStateForTests();
    pathValidationCache.clear();
    resetSsrWarningFlag();
    resetBroadUseStoreWarnings();
    resetConfig();
    clearFeatureContexts();
    setRegistryScope(new URL("./store.js", import.meta.url).href);
    bindRegistry(defaultRegistryScope);
};

export const hydrateStores = (
    snapshot: Record<string, any>,
    options: Record<string, StoreOptions> & { default?: StoreOptions } = {}
): { hydrated: string[]; created: string[]; failed: Record<string, string> } => {
    const result = { hydrated: [] as string[], created: [] as string[], failed: {} as Record<string, string> };
    if (!snapshot || typeof snapshot !== "object") return result;
    Object.entries(snapshot).forEach(([storeName, data]) => {
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
