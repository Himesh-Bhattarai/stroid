import {
    warn,
    error,
    log,
    isDev,
    isValidData,
    isValidStoreName,
    sanitize,
    validateDepth,
    getByPath,
    setByPath,
    parsePath,
    suggestStoreName,
    deepClone,
    produceClone,
    hashState,
    runSchemaValidation,
    getType,
    PathInput,
} from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";
import {
    collectLegacyOptionDeprecationWarnings,
    normalizeStoreOptions,
    resetLegacyOptionDeprecationWarningsForTests,
    type MiddlewareCtx,
    type NormalizedOptions,
    type PersistConfig,
    type StoreOptions,
} from "./adapters/options.js";
import {
    MIDDLEWARE_ABORT,
    runMiddleware,
    runStoreHook,
} from "./features/lifecycle.js";
import {
    getStoreFeatureFactory,
    hasRegisteredStoreFeature,
    type FeatureDeleteContext,
    type FeatureName,
    type FeatureWriteContext,
    type StoreFeatureMeta,
    type StoreFeatureRuntime,
} from "./feature-registry.js";
import {
    getStoreRegistry,
    hasStoreEntry as _hasStoreEntry,
    isStoreDeleting,
    clearStoreRegistries,
    normalizeStoreRegistryScope,
} from "./store-registry.js";
import { createStoreAdmin } from "./internals/store-admin.js";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
type PathInternal<T, Depth extends number> = Depth extends 0
    ? never
    : T extends Primitive
        ? never
        : {
            [K in keyof T & (string | number)]: T[K] extends Primitive | Array<unknown>
                ? `${K}`
                : `${K}` | `${K}.${PathInternal<T[K], PrevDepth[Depth]>}`
        }[keyof T & (string | number)];

export type Path<T, Depth extends number = 6> = PathInternal<T, Depth>;

export type PathValue<T, P extends Path<T>> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? Rest extends Path<T[K]>
            ? PathValue<T[K], Rest>
            : never
        : never
    : P extends keyof T
        ? T[P]
        : never;

export type PartialDeep<T> = T extends Primitive
    ? T
    : { [K in keyof T]?: PartialDeep<T[K]> };

export type StoreValue = unknown;

export interface StoreDefinition<Name extends string = string, State = StoreValue> {
    name: Name;
    // marker for inference only, not used at runtime
    state?: State;
}
export type { PersistConfig, MiddlewareCtx, StoreOptions } from "./adapters/options.js";

interface MetaEntry extends StoreFeatureMeta {}

type Subscriber = (value: StoreValue | null) => void;

const _registry = getStoreRegistry(normalizeStoreRegistryScope(import.meta.url));
const _stores = _registry.stores as Record<string, StoreValue>;
const _subscribers = _registry.subscribers as Record<string, Subscriber[]>;
const _initial = _registry.initialStates as Record<string, StoreValue>;
const _meta = _registry.metaEntries as Record<string, MetaEntry>;
const _snapshotCache = _registry.snapshotCache as Record<string, { source: StoreValue; snapshot: StoreValue | null }>;

const _pendingNotifications = new Set<string>();
let _notifyScheduled = false;
let _batchDepth = 0;
let _ssrWarningIssued = false;
const _featureRuntimes = _registry.featureRuntimes as Map<FeatureName, StoreFeatureRuntime>;
const _storeAdmin = createStoreAdmin(import.meta.url);
const _nameOf = (name: string | StoreDefinition<string, StoreValue>): string =>
    typeof name === "string" ? name : name.name;

const _scheduleFlush = (): void => {
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    const run = () => {
        _notifyScheduled = false;
        const names = Array.from(_pendingNotifications);
        _pendingNotifications.clear();
        names.forEach((name) => {
            const subs = _subscribers[name];
            if (!subs || subs.length === 0) return;
            const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const snapshot = deepClone(_stores[name]);
            subs.forEach((fn) => {
                try { fn(snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            });
            const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const delta = end - start;
            const metrics = _meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += delta;
            metrics.lastNotifyMs = delta;
            if (_meta[name]) _meta[name].metrics = metrics;
        });
        if (_pendingNotifications.size > 0) _scheduleFlush();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};

const _notify = (name: string): void => {
    _pendingNotifications.add(name);
    if (_batchDepth === 0) _scheduleFlush();
};

const _exists = (name: string): boolean => {
    if (_hasStoreEntry(_registry, name) && !isStoreDeleting(_registry, name)) return true;
    suggestStoreName(name, Object.keys(_stores));
    return false;
};

const _validatePathSafety = (storeName: string, base: StoreValue, path: PathInput, nextValue: unknown): { ok: boolean; reason?: string } => {
    const parts = parsePath(path);
    if (parts.length === 0) return { ok: true };

    if (base === null || base === undefined) {
        const reason = `Cannot set "${parts.join(".")}" on "${storeName}" because the store value is ${base === null ? "null" : "undefined"}.`;
        warn(reason);
        return { ok: false, reason };
    }

    let cursor: unknown = base;
    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];
        const isLast = i === parts.length - 1;

        if (cursor === null || cursor === undefined || typeof cursor !== "object") {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is not an object.`;
            warn(reason);
            return { ok: false, reason };
        }

        if (Array.isArray(cursor)) {
            const idx = Number(key);
            if (!Number.isInteger(idx) || idx < 0) {
                const reason = `Path "${parts.join(".")}" targets non-numeric index "${key}" on an array in "${storeName}".`;
                warn(reason);
                return { ok: false, reason };
            }

            const arr = cursor as unknown[];
            if (idx >= arr.length) {
                const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - index ${idx} is out of bounds (length ${arr.length}).`;
                warn(reason);
                return { ok: false, reason };
            }

            if (isLast) {
                const existing = arr[idx];
                if (existing !== undefined && existing !== null) {
                    const expected = getType(existing);
                    const incoming = getType(nextValue);
                    if (expected !== incoming) {
                        const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incoming}.`;
                        warn(reason);
                        return { ok: false, reason };
                    }
                }
                return { ok: true };
            }
            cursor = arr[idx];
            continue;
        }

        const hasKey = Object.prototype.hasOwnProperty.call(cursor as Record<string, unknown>, key);
        if (!hasKey) {
            const reason = `Path "${parts.join(".")}" does not exist on store "${storeName}" (missing "${key}").`;
            warn(reason);
            return { ok: false, reason };
        }
        if (isLast) {
            const existing = (cursor as Record<string, unknown>)[key];
            if (existing !== undefined && existing !== null) {
                const expected = getType(existing);
                const incoming = getType(nextValue);
                if (expected !== incoming) {
                    const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incoming}.`;
                    warn(reason);
                    return { ok: false, reason };
                }
            }
            return { ok: true };
        }
        cursor = (cursor as Record<string, unknown>)[key];
    }
    return { ok: true };
};

const _reportStoreError = (name: string, message: string): void => {
    _meta[name]?.options?.onError?.(message);
    warn(message);
};

const _reportStoreCreationError = (message: string, onError?: (message: string) => void): void => {
    onError?.(message);
    if (isDev()) {
        error(message);
        return;
    }
    if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error(`[stroid] ${message}`);
    }
};

const _runMiddleware = (
    name: string,
    payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown; }
): StoreValue | typeof MIDDLEWARE_ABORT =>
    runMiddleware({
        name,
        payload,
        middlewares: _meta[name]?.options?.middleware || [],
        onError: _meta[name]?.options?.onError,
        warn,
    });

const _validateSchema = (name: string, next: StoreValue): { ok: boolean } => {
    const schema = _meta[name]?.options?.schema;
    if (!schema) return { ok: true };
    const res = runSchemaValidation(schema, next);
    if (!res.ok) {
        _reportStoreError(name, `Schema validation failed for "${name}": ${res.error}`);
    }
    return res as { ok: boolean };
};

const _runValidator = (
    name: string,
    value: StoreValue,
    validator?: (next: StoreValue) => boolean,
    onError?: (message: string) => void
): boolean => {
    const report = (message: string, shouldWarn = true): void => {
        const handlers = new Set<((message: string) => void)>();
        const metaHandler = _meta[name]?.options?.onError;
        if (typeof metaHandler === "function") handlers.add(metaHandler);
        if (typeof onError === "function") handlers.add(onError);
        handlers.forEach((handler) => handler(message));
        if (shouldWarn) {
            warn(message);
        }
    };
    if (typeof validator !== "function") return true;
    try {
        if (validator(value) === false) {
            const message = `Validator blocked update for "${name}"`;
            report(message, false);
            return false;
        }
        return true;
    } catch (err) {
        const message = `Validator for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
        report(message);
        return false;
    }
};

const _runStoreHook = (
    name: string,
    label: "onCreate" | "onSet" | "onReset" | "onDelete",
    fn: ((...args: any[]) => void) | undefined,
    args: any[]
): void =>
    runStoreHook({
        name,
        label,
        fn,
        args,
        onError: _meta[name]?.options?.onError,
        warn,
    });

const _sanitizeValue = (
    name: string,
    value: unknown,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    try {
        return { ok: true, value: sanitize(value) as StoreValue };
    } catch (err) {
        const message = `Sanitize failed for "${name}": ${(err as { message?: string })?.message ?? err}`;
        _meta[name]?.options?.onError?.(message);
        onError?.(message);
        warn(message);
        return { ok: false };
    }
};

const _normalizeCommittedState = (
    name: string,
    value: unknown,
    validator?: (next: StoreValue) => boolean,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    const sanitized = _sanitizeValue(name, value, onError);
    if (!sanitized.ok) return { ok: false };

    const schemaCheck = _validateSchema(name, sanitized.value);
    if (!schemaCheck.ok) return { ok: false };

    if (!_runValidator(name, sanitized.value, validator, onError)) {
        return { ok: false };
    }

    return { ok: true, value: sanitized.value };
};

const _setStoreValueInternal = (name: string, value: StoreValue): void => {
    _stores[name] = isDev() ? devDeepFreeze(value) : value;
};

const _applyFeatureState = (name: string, value: StoreValue, updatedAtMs = Date.now()): void => {
    _setStoreValueInternal(name, value);
    if (!_meta[name]) return;
    _meta[name].updatedAt = new Date(updatedAtMs).toISOString();
    _meta[name].updateCount++;
};

const _getFeatureRuntime = (name: FeatureName): StoreFeatureRuntime | undefined => {
    const existing = _featureRuntimes.get(name);
    if (existing) return existing;
    const factory = getStoreFeatureFactory(name);
    if (!factory) return undefined;
    const runtime = factory();
    _featureRuntimes.set(name, runtime);
    return runtime;
};

const _warnMissingFeature = (storeName: string, featureName: FeatureName, onError?: (message: string) => void): void => {
    const message =
        `Store "${storeName}" requested ${featureName} support, but "${featureName}" is not registered.\n` +
        `Import "stroid/${featureName}" before calling createStore("${storeName}", ...).`;
    onError?.(message);
    warn(message);
};

const _resolveFeatureAvailability = (name: string, options: NormalizedOptions): NormalizedOptions => {
    const next: NormalizedOptions = { ...options };

    if (next.persist && !hasRegisteredStoreFeature("persist")) {
        if (next.explicitPersist) _warnMissingFeature(name, "persist", next.onError);
        next.persist = null;
    }

    if (next.sync && !hasRegisteredStoreFeature("sync")) {
        if (next.explicitSync) _warnMissingFeature(name, "sync", next.onError);
        next.sync = false;
    }

    if (!hasRegisteredStoreFeature("devtools")) {
        if (next.explicitDevtools) _warnMissingFeature(name, "devtools", next.onError);
        next.devtools = false;
        next.historyLimit = 0;
        next.redactor = undefined;
    }

    return next;
};

const _createBaseFeatureContext = (name: string) => {
    const meta = _meta[name];
    if (!meta) {
        warn(`Internal feature context requested for "${name}" after metadata was cleared.`);
        return null;
    }

    return {
        name,
        options: meta.options,
        getMeta: () => _meta[name],
        getStoreValue: () => _stores[name],
        getAllStores: () => _stores,
        getInitialState: () => _initial[name],
        hasStore: () => _hasStoreEntry(_registry, name),
        setStoreValue: (value: StoreValue) => {
            _setStoreValueInternal(name, value);
        },
        applyFeatureState: (value: StoreValue, updatedAtMs?: number) => {
            _applyFeatureState(name, value, updatedAtMs);
        },
        notify: () => {
            _notify(name);
        },
        reportStoreError: (message: string) => {
            _reportStoreError(name, message);
        },
        warn,
        log,
        hashState,
        deepClone,
        sanitize,
        validateSchema: (next: StoreValue) => _validateSchema(name, next),
        isDev,
    };
};

const _runFeatureCreateHooks = (name: string): void => {
    const baseContext = _createBaseFeatureContext(name);
    if (!baseContext) return;
    (["persist", "devtools", "sync"] as FeatureName[]).forEach((featureName) => {
        const runtime = _getFeatureRuntime(featureName);
        runtime?.onStoreCreate?.(baseContext);
    });
};

const _runFeatureWriteHooks = (name: string, action: string, prev: StoreValue, next: StoreValue): void => {
    const baseContext = _createBaseFeatureContext(name);
    if (!baseContext) return;
    const ctx: FeatureWriteContext = {
        ...baseContext,
        action,
        prev,
        next,
    };

    (["persist", "devtools", "sync"] as FeatureName[]).forEach((featureName) => {
        const runtime = _getFeatureRuntime(featureName);
        runtime?.onStoreWrite?.(ctx);
    });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const createStore = <Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> | undefined => {
    if (!isValidStoreName(name)) return;
    if (!isValidData(initialData)) return;

    collectLegacyOptionDeprecationWarnings(option).forEach((message) => {
        warn(message);
    });

    const normalizedOptions = _resolveFeatureAvailability(name, normalizeStoreOptions(option, name));

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
        _reportStoreCreationError(
            `createStore("${name}") is blocked on the server in production to prevent cross-request memory leaks.\n` +
            `Call createStoreForRequest(...) inside each request scope or pass { scope: "global" } to opt in.`,
            option.onError as ((message: string) => void) | undefined
        );
        return;
    }

    if (_hasStoreEntry(_registry, name)) {
        const msg = `Store "${name}" already exists. Call setStore("${name}", data) to update instead.`;
        warn(msg);
        _meta[name]?.options?.onError?.(msg);
        return { name } as StoreDefinition<Name, State>;
    }

    if (isServer && !allowGlobalSSR && !_ssrWarningIssued && isDev()) {
        _ssrWarningIssued = true;
        warn(
            `createStore(\"${name}\") called in a server environment. ` +
            `Use createStoreForRequest(...) per request to avoid cross-request leaks ` +
            `or pass { allowSSRGlobalStore: true } if you really want a global store on the server.`
        );
    }

    const cleanResult = _sanitizeValue(name, initialData, normalizedOptions.onError);
    if (!cleanResult.ok) return;
    const clean = cleanResult.value;

    const initialSchemaResult = normalizedOptions.schema ? runSchemaValidation(normalizedOptions.schema, clean) : { ok: true };
    if (!initialSchemaResult.ok) {
        const msg = `Schema validation failed for "${name}": ${initialSchemaResult.error}`;
        normalizedOptions.onError?.(msg);
        warn(msg);
        return;
    }

    if (!_runValidator(name, clean as StoreValue, normalizedOptions.validator, normalizedOptions.onError)) return;

    const hadPreexistingSubscribers = !!_subscribers[name]?.length;
    _stores[name] = clean;
    _subscribers[name] = _subscribers[name] || [];
    _initial[name] = deepClone(clean);
    _meta[name] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updateCount: 0,
        version: normalizedOptions.version,
        metrics: { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
        options: normalizedOptions,
    };

    _runFeatureCreateHooks(name);
    _runStoreHook(name, "onCreate", _meta[name].options.onCreate, [clean]);
    if (hadPreexistingSubscribers) _notify(name);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return { name } as StoreDefinition<Name, State>;
};

type KeyOrData = string | string[] | Record<string, unknown> | ((draft: any) => void);

export function setStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P, value: PathValue<State, P>): void;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, mutator: (draft: State) => void): void;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, data: PartialDeep<State>): void;
export function setStore(name: string, data: Record<string, unknown>): void;
export function setStore(name: string, path: string | string[], value: unknown): void;
export function setStore(name: string, mutator: (draft: any) => void): void;
export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): void {
    const storeName = _nameOf(name);
    if (!_exists(storeName)) return;
    let updated: StoreValue;
    const prev = _stores[storeName];

    if (typeof keyOrData === "function" && value === undefined) {
        try {
            updated = produceClone(prev, keyOrData as (draft: any) => void);
        } catch (err) {
            _reportStoreError(storeName, `Mutator for "${storeName}" failed: ${(err as { message?: string })?.message ?? err}`);
            return;
        }
    } else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) return;
        if (typeof prev !== "object" || prev === null || Array.isArray(prev)) {
            error(
                `setStore("${storeName}", data) only merges into object stores.\n` +
                `Use setStore("${storeName}", "path", value) or recreate the store with an object shape.`
            );
            return;
        }
        const partialResult = _sanitizeValue(storeName, keyOrData);
        if (!partialResult.ok) return;
        updated = { ...(prev as Record<string, unknown>), ...partialResult.value as Record<string, unknown> };
    } else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData as PathInput)) return;
        const valueResult = _sanitizeValue(storeName, value);
        if (!valueResult.ok) return;
        const sanitizedValue = valueResult.value;
        const safePath = _validatePathSafety(storeName, prev, keyOrData as PathInput, sanitizedValue);
        if (!safePath.ok) {
            _meta[storeName]?.options?.onError?.(safePath.reason ?? `Invalid path for "${storeName}".`);
            return;
        }
        updated = setByPath(prev as Record<string, unknown>, keyOrData as PathInput, sanitizedValue);
    } else {
        error(
            `setStore("${storeName}") - invalid arguments.\n` +
            `Usage:\n` +
            `  setStore("${storeName}", "field", value)\n` +
            `  setStore("${storeName}", "nested.field", value)\n` +
            `  setStore("${storeName}", { field: value })`
        );
        return;
    }

    if (!isValidData(updated)) return;
    const validator = _meta[storeName]?.options?.validator;
    const normalizedUpdate = _normalizeCommittedState(storeName, updated, validator);
    if (!normalizedUpdate.ok) return;
    const sanitizedUpdate = normalizedUpdate.value;

    const next = _runMiddleware(storeName, { action: "set", prev, next: sanitizedUpdate, path: keyOrData });
    if (next === MIDDLEWARE_ABORT) return;
    const committed = _normalizeCommittedState(storeName, next, validator);
    if (!committed.ok) return;
    _setStoreValueInternal(storeName, committed.value);
    _meta[storeName].updatedAt = new Date().toISOString();
    _meta[storeName].updateCount++;
    _runFeatureWriteHooks(storeName, "set", prev, committed.value);
    _runStoreHook(storeName, "onSet", _meta[storeName].options.onSet, [prev, committed.value]);
    _notify(storeName);

    log(`Store "${storeName}" updated`);
}

export const setStoreBatch = (fn: () => unknown): void => {
    if (typeof fn !== "function") {
        throw new Error("setStoreBatch requires a synchronous function callback.");
    }
    if ((fn as Function).constructor?.name === "AsyncFunction") {
        throw new Error("setStoreBatch does not support async functions.");
    }
    _batchDepth++;
    try {
        const result = fn();
        if (result && typeof (result as Promise<unknown>).then === "function") {
            if (_pendingNotifications.size > 0) {
                _scheduleFlush();
            }
            throw new Error("setStoreBatch does not support promise-returning callbacks.");
        }
    } finally {
        _batchDepth = Math.max(0, _batchDepth - 1);
        if (_batchDepth === 0 && _pendingNotifications.size > 0) {
            _scheduleFlush();
        }
    }
};

export function getStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P): PathValue<State, P> | null;
export function getStore<Name extends string, State>(name: StoreDefinition<Name, State>, path?: undefined): State | null;
export function getStore(name: string, path?: PathInput): StoreValue | null;
export function getStore(name: string | StoreDefinition<string, StoreValue>, path?: PathInput): StoreValue | null {
    const storeName = _nameOf(name);
    if (!_exists(storeName)) return null;
    const data = _stores[storeName];
    if (path === undefined) {
        return deepClone(data);
    }
    if (!validateDepth(path)) return null;
    return deepClone(getByPath(data, path));
}

export const deleteStore = (name: string): void => {
    if (!_exists(name)) return;
    _storeAdmin.deleteExistingStore(name);
};

export const resetStore = (name: string): void => {
    if (!_exists(name)) return;
    if (!_initial[name]) return;
    const prev = _stores[name];
    const resetValue = deepClone(_initial[name]);
    _setStoreValueInternal(name, resetValue);
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;
    _runFeatureWriteHooks(name, "reset", prev, resetValue);
    _runStoreHook(name, "onReset", _meta[name].options.onReset, [prev, resetValue]);
    _notify(name);
    log(`Store "${name}" reset to initial state/value`);
};

export const mergeStore = (name: string, data: Record<string, unknown>): void => {
    if (!_exists(name)) return;
    if (!isValidData(data)) return;
    const current = _stores[name];
    if (typeof current !== "object" || Array.isArray(current) || current === null) {
        error(
            `mergeStore("${name}") only works on object stores.\n` +
            `Use setStore("${name}", value) instead.`
        );
        return;
    }
    const mergeResult = _sanitizeValue(name, data);
    if (!mergeResult.ok) return;
    const next = { ...(current as Record<string, unknown>), ...mergeResult.value as Record<string, unknown> };

    const validator = _meta[name]?.options?.validator;
    const normalizedNext = _normalizeCommittedState(name, next, validator);
    if (!normalizedNext.ok) return;

    const final = _runMiddleware(name, { action: "merge", prev: current, next: normalizedNext.value, path: null });
    if (final === MIDDLEWARE_ABORT) return;
    const committed = _normalizeCommittedState(name, final, validator);
    if (!committed.ok) return;
    _setStoreValueInternal(name, committed.value);
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;
    _runFeatureWriteHooks(name, "merge", current, committed.value);
    _runStoreHook(name, "onSet", _meta[name].options.onSet, [current, committed.value]);
    _notify(name);
    log(`Store "${name}" merged with data`);
};

const _replaceStoreState = (name: string, data: unknown, action = "hydrate"): void => {
    if (!_exists(name)) return;
    const prev = _stores[name];
    const nextResult = _sanitizeValue(name, data);
    if (!nextResult.ok) return;
    const nextValue = nextResult.value;
    if (nextValue === undefined) {
        const message = `Whole-store undefined replacement is blocked for "${name}". Use null for intentional empty state.`;
        _meta[name]?.options?.onError?.(message);
        warn(message);
        return;
    }

    const validator = _meta[name]?.options?.validator;
    const normalizedNext = _normalizeCommittedState(name, nextValue, validator);
    if (!normalizedNext.ok) return;

    const final = _runMiddleware(name, { action, prev, next: normalizedNext.value, path: null });
    if (final === MIDDLEWARE_ABORT) return;
    const committed = _normalizeCommittedState(name, final, validator);
    if (!committed.ok) return;
    _setStoreValueInternal(name, committed.value);
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;
    _runFeatureWriteHooks(name, action, prev, committed.value);
    _runStoreHook(name, "onSet", _meta[name].options.onSet, [prev, committed.value]);
    _notify(name);
    log(`Store "${name}" hydrated`);
};

export const clearAllStores = (): void => {
    _storeAdmin.clearAllStores();
};

export const _hardResetAllStoresForTest = (): void => {
    _featureRuntimes.forEach((runtime) => {
        try { runtime.resetAll?.(); } catch (_) { /* ignore cleanup errors */ }
    });
    clearStoreRegistries(_registry);
    resetLegacyOptionDeprecationWarningsForTests();

    _pendingNotifications.clear();
    _notifyScheduled = false;
    _batchDepth = 0;
    _ssrWarningIssued = false;
    _featureRuntimes.clear();
};

export const _hasStoreEntryInternal = (name: string): boolean => _hasStoreEntry(_registry, name);
export const _getStoreValueRef = (name: string): StoreValue | undefined => _stores[name];
export const _getFeatureApi = (name: FeatureName) => _getFeatureRuntime(name)?.api;

export const hasStore = (name: string): boolean => _hasStoreEntry(_registry, name);

export const _subscribe = (name: string, fn: Subscriber): (() => void) => {
    if (!_subscribers[name]) _subscribers[name] = [];
    _subscribers[name].push(fn);
    return () => {
        const current = _subscribers[name];
        if (!current || current.length === 0) return;
        const index = current.indexOf(fn);
        if (index < 0) return;
        const next = current.slice();
        next.splice(index, 1);
        _subscribers[name] = next;
    };
};

export const _getSnapshot = (name: string): StoreValue | null => {
    if (!_hasStoreEntry(_registry, name)) return null;
    const source = _stores[name];
    const cached = _snapshotCache[name];
    if (cached && cached.source === source) return cached.snapshot;
    const snapshot = deepClone(source);
    const safeSnapshot = snapshot && typeof snapshot === "object"
        ? devDeepFreeze(snapshot)
        : snapshot;
    _snapshotCache[name] = { source, snapshot: safeSnapshot };
    return safeSnapshot;
};

export const getInitialState = (): Record<string, StoreValue> => deepClone(_initial) as Record<string, StoreValue>;

export const getMetrics = (name: string): MetaEntry["metrics"] | null => {
    const meta = _meta[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};

export const hydrateStores = (snapshot: Record<string, any>, options: Record<string, StoreOptions> & { default?: StoreOptions } = {}): void => {
    if (!snapshot || typeof snapshot !== "object") return;
    Object.entries(snapshot).forEach(([name, data]) => {
        if (hasStore(name)) {
            _replaceStoreState(name, data, "hydrate");
        } else {
            createStore(name, data, options[name] || options.default || {});
        }
    });
};

