/**
 * @module store-lifecycle
 *
 * LAYER: Core Engine
 * OWNS:  Registry state variables (stores, meta, subscribers, …) and all
 *        pure primitives that operate on them (sanitize, validate, path-safety,
 *        feature hook dispatch).
 *
 * DOES NOT KNOW about: createStore(), setStore(), React hooks,
 *        or any specific feature plugin by name.
 *
 * Consumers: store-write (write API), store-read, store-notify,
 *            hooks-core, store-engine (re-export barrel).
 */
import {
    warn,
    error,
    log,
    critical,
    isDev,
    sanitize,
    parsePath,
    suggestStoreName,
    deepClone,
    hashState,
    runSchemaValidation,
    getType,
    type SupportedType,
    PathInput,
} from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";
import {
    type NormalizedOptions,
    type ValidateOption,
} from "./adapters/options.js";
import {
    runMiddleware,
    runStoreHook,
    MIDDLEWARE_ABORT,
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
    defaultRegistryScope,
    getRequestCarrier,
} from "./store-registry.js";
export { defaultRegistryScope } from "./store-registry.js";
import { createStoreAdmin } from "./internals/store-admin.js";
import { getNamespace } from "./internals/config.js";

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

// Ambient map users can augment to get typed string access to stores.
// Example:
//   declare module "stroid" { interface StoreStateMap { user: UserState } }
export interface StoreStateMap {}
export type StoreName = [keyof StoreStateMap] extends [never] ? string : keyof StoreStateMap & string;
export type StateFor<Name extends string> = Name extends keyof StoreStateMap ? StoreStateMap[Name] : StoreValue;

// A typed store handle that still matches the runtime StoreDefinition shape.
export type StoreKey<Name extends string = string, State = StoreValue> =
    StoreDefinition<Name, State> & { __store?: true };

export interface StoreDefinition<Name extends string = string, State = StoreValue> {
    name: Name;
    // marker for inference only, not used at runtime
    state?: State;
}

export type WriteResult =
    | { ok: true }
    | { ok: false; reason: "not-found" | "validate" | "path" | "middleware" | "ssr" | "invalid-args" };

interface MetaEntry extends StoreFeatureMeta {}

export type Subscriber = (value: StoreValue | null) => void;

type BaseFeatureContext = {
    name: string;
    options: MetaEntry["options"];
    getMeta: () => MetaEntry | undefined;
    getStoreValue: () => StoreValue;
    getAllStores: () => Record<string, StoreValue>;
    getInitialState: () => StoreValue | undefined;
    hasStore: () => boolean;
    setStoreValue: (value: StoreValue) => void;
    applyFeatureState: (value: StoreValue, updatedAtMs?: number) => void;
    notify: () => void;
    reportStoreError: (message: string) => void;
    warn: typeof warn;
    log: typeof log;
    hashState: typeof hashState;
    deepClone: typeof deepClone;
    sanitize: typeof sanitize;
    validate: (next: StoreValue) => { ok: true; value: StoreValue } | { ok: false };
    isDev: typeof isDev;
};

let _scope = defaultRegistryScope;
let _registry = getStoreRegistry(_scope);
export let stores = _registry.stores as Record<string, StoreValue>;
export let subscribers = _registry.subscribers as Record<string, Set<Subscriber>>;
export let initialStates = _registry.initialStates as Record<string, StoreValue>;
export let initialFactories = _registry.initialFactories as Record<string, (() => StoreValue) | undefined>;
export let meta = _registry.metaEntries as Record<string, MetaEntry>;
export let snapshotCache = _registry.snapshotCache as Record<string, { version: number; snapshot: StoreValue | null }>;
type PathSafetyVerdict = { ok: true } | { ok: false; reason: string };
type PathValidationCacheNode = {
    children: Map<string, PathValidationCacheNode>;
    verdicts?: Map<SupportedType, PathSafetyVerdict>;
};
export let pathValidationCache = new Map<string, PathValidationCacheNode>();
export let featureRuntimes = _registry.featureRuntimes as Map<FeatureName, StoreFeatureRuntime>;
export let storeAdmin = createStoreAdmin(_scope);
const baseFeatureContexts = new Map<string, BaseFeatureContext | null>();
export const clearFeatureContexts = (): void => baseFeatureContexts.clear();

export const bindRegistry = (scopeOrRegistry?: string | ReturnType<typeof getStoreRegistry>): void => {
    const resolvedScope = typeof scopeOrRegistry === "string"
        ? normalizeStoreRegistryScope(scopeOrRegistry)
        : _scope;
    const registry = typeof scopeOrRegistry === "string"
        ? getStoreRegistry(resolvedScope)
        : scopeOrRegistry ?? getStoreRegistry(_scope);

    _scope = resolvedScope;
    _registry = registry;
    stores = _registry.stores as Record<string, StoreValue>;
    subscribers = _registry.subscribers as Record<string, Set<Subscriber>>;
    initialStates = _registry.initialStates as Record<string, StoreValue>;
    initialFactories = _registry.initialFactories as Record<string, (() => StoreValue) | undefined>;
    meta = _registry.metaEntries as Record<string, MetaEntry>;
    snapshotCache = _registry.snapshotCache as Record<string, { version: number; snapshot: StoreValue | null }>;
    pathValidationCache = new Map<string, PathValidationCacheNode>();
    featureRuntimes = _registry.featureRuntimes as Map<FeatureName, StoreFeatureRuntime>;
    storeAdmin = createStoreAdmin(_scope);
    clearFeatureContexts();
    resetSsrWarningFlag();
    bindAsyncRegistry(resolvedScope);
};

export const useRegistry = (scopeId: string): void => bindRegistry(scopeId);

const _ssrWarningsIssued = new Set<string>();
export const getSsrWarningIssued = (name?: string): boolean =>
    name ? _ssrWarningsIssued.has(name) : _ssrWarningsIssued.size > 0;
export const markSsrWarningIssued = (name: string): void => {
    if (!name) return;
    _ssrWarningsIssued.add(name);
};
export const resetSsrWarningFlag = (): void => {
    _ssrWarningsIssued.clear();
};

const _namespaceWarnings = new Set<string>();
export const qualifyName = (raw: string): string => {
    const ns = getNamespace();
    if (!ns) return raw;
    if (raw.includes("::")) return raw;
    if (isDev() && !_namespaceWarnings.has(raw)) {
        _namespaceWarnings.add(raw);
        warn(
            `Namespace "${ns}" is active; treating store "${raw}" as "${ns}::${raw}". ` +
            `Consider using namespace("${ns}").create("...") to be explicit.`
        );
    }
    return `${ns}::${raw}`;
};

export const nameOf = (name: string | StoreDefinition<string, StoreValue>): string =>
    qualifyName(typeof name === "string" ? name : name.name);

export const hasStoreEntryInternal = (name: string): boolean => _hasStoreEntry(_registry, name);
export const getStoreValueRef = (name: string): StoreValue | undefined => {
    const carrier = getRequestCarrier();
    if (carrier && Object.prototype.hasOwnProperty.call(carrier, name)) {
        return carrier[name] as StoreValue;
    }
    return stores[name];
};
export const getFeatureApi = (name: FeatureName) => featureRuntimes.get(name)?.api;

export const exists = (name: string): boolean => {
    if (_hasStoreEntry(_registry, name) && !isStoreDeleting(_registry, name)) return true;
    suggestStoreName(name, Object.keys(stores));
    return false;
};

export const validatePathSafety = (storeName: string, base: StoreValue, path: PathInput, nextValue: unknown): { ok: boolean; reason?: string } => {
    const metaEntry = meta[storeName];
    if (!metaEntry) return { ok: true };
    const parts = parsePath(path);
    if (parts.length === 0) return { ok: true };
    const incomingType = getType(nextValue);
    let root = pathValidationCache.get(storeName);
    if (!root) {
        if (pathValidationCache.size > 1000) pathValidationCache.clear();
        root = { children: new Map() };
        pathValidationCache.set(storeName, root);
    }

    let node = root;
    for (const segment of parts) {
        let child = node.children.get(segment);
        if (!child) {
            child = { children: new Map() };
            node.children.set(segment, child);
        }
        node = child;
    }

    const cached = node.verdicts?.get(incomingType);
    if (cached) return cached;

    const allowCreate = metaEntry.options?.pathCreate === true;
    let cursor: unknown = base;
    let verdict: PathSafetyVerdict = { ok: true };
    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];
        const isLast = i === parts.length - 1;

        if (cursor === null || cursor === undefined) {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is ${cursor === null ? "null" : "undefined"}.`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }

        if (typeof cursor !== "object") {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is not an object.`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }

        if (Array.isArray(cursor)) {
            const idx = Number(key);
            if (!Number.isInteger(idx) || idx < 0) {
                const reason = `Path "${parts.join(".")}" targets non-numeric index "${key}" on an array in "${storeName}".`;
                critical(reason);
                verdict = { ok: false, reason };
                break;
            }

            const arr = cursor as unknown[];
            if (idx >= arr.length) {
                const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - index ${idx} is out of bounds (length ${arr.length}).`;
                critical(reason);
                verdict = { ok: false, reason };
                break;
            }

            if (isLast) {
                const existing = arr[idx];
                 if (existing !== undefined && existing !== null) {
                     const expected = getType(existing);
                     if (expected !== incomingType) {
                         const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incomingType}.`;
                         critical(reason);
                         verdict = { ok: false, reason };
                         break;
                     }
                 }
                verdict = { ok: true };
                break;
            }
            cursor = arr[idx];
            continue;
        }

        const hasKey = Object.prototype.hasOwnProperty.call(cursor as Record<string, unknown>, key);
        if (!hasKey) {
            if (allowCreate && isLast) {
                verdict = { ok: true };
                break;
            }
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - unknown key "${key}" at "${parts.slice(0, i).join(".") || "root"}".`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }
        if (isLast) {
             const existing = (cursor as Record<string, unknown>)[key];
             if (existing !== undefined && existing !== null) {
                 const expected = getType(existing);
                 if (expected !== incomingType) {
                     const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incomingType}.`;
                     critical(reason);
                     verdict = { ok: false, reason };
                     break;
                 }
             }
             verdict = { ok: true };
            break;
        }
        cursor = (cursor as Record<string, unknown>)[key];
    }

    if (!node.verdicts) node.verdicts = new Map();
    node.verdicts.set(incomingType, verdict);
    return verdict;
};

export const reportStoreError = (name: string, message: string): void => {
    meta[name]?.options?.onError?.(message);
    critical(message);
};

export const reportStoreCreationError = (message: string, onError?: (message: string) => void): void => {
    onError?.(message);
    error(message);
};

const collectErrorHandlers = (name: string, onError?: (message: string) => void): Set<(message: string) => void> => {
    const handlers = new Set<((message: string) => void)>();
    const metaHandler = meta[name]?.options?.onError;
    if (typeof metaHandler === "function") handlers.add(metaHandler);
    if (typeof onError === "function") handlers.add(onError);
    return handlers;
};

export const sanitizeValue = (
    name: string,
    value: unknown,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    try {
        return { ok: true, value: sanitize(value) as StoreValue };
    } catch (err) {
        const message = `Sanitize failed for "${name}": ${(err as { message?: string })?.message ?? err}`;
        meta[name]?.options?.onError?.(message);
        onError?.(message);
        warn(message);
        return { ok: false };
    }
};

export const runValidation = (
    name: string,
    value: StoreValue,
    validate: ValidateOption | undefined,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    if (!validate) return { ok: true, value };
    const handlers = collectErrorHandlers(name, onError);
    const report = (message: string, severity: "warn" | "critical"): void => {
        handlers.forEach((handler) => handler(message));
        if (severity === "critical") critical(message);
        else warn(message);
    };

    if (typeof validate === "function") {
        try {
            const result = validate(value);
            if (result === false) {
                report(`Validation blocked update for "${name}"`, "warn");
                return { ok: false };
            }
            return { ok: true, value: result === true ? value : result as StoreValue };
        } catch (err) {
            report(`Validation for "${name}" failed: ${(err as { message?: string })?.message ?? err}`, "critical");
            return { ok: false };
        }
    }

    const schemaResult = runSchemaValidation(validate, value);
    if (!schemaResult.ok) {
        report(`Validation failed for "${name}": ${schemaResult.error}`, "critical");
        return { ok: false };
    }
    return { ok: true, value: (schemaResult.data ?? value) as StoreValue };
};

export const normalizeCommittedState = (
    name: string,
    value: unknown,
    validate: ValidateOption | undefined,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    const sanitized = sanitizeValue(name, value, onError);
    if (!sanitized.ok) return { ok: false };

    const validation = runValidation(name, sanitized.value, validate, onError);
    if (!validation.ok) return { ok: false };

    return { ok: true, value: validation.value };
};

export const setStoreValueInternal = (name: string, value: StoreValue): void => {
    const carrier = getRequestCarrier();
    const frozen = isDev() ? devDeepFreeze(value) : value;
    if (carrier) {
        carrier[name] = frozen;
        // Keep the global registry aware that this store exists, but do not leak data
        if (!Object.prototype.hasOwnProperty.call(stores, name)) {
            stores[name] = undefined;
        }
    } else {
        stores[name] = frozen;
    }
};

export const invalidatePathCache = (name: string): void => {
    pathValidationCache.delete(name);
};

export const materializeInitial = (name: string): boolean => {
    if (stores[name] !== undefined) return true;
    const factory = initialFactories[name];
    if (!factory) return true;
    try {
        const produced = factory();
        const cleanResult = sanitizeValue(name, produced, meta[name]?.options?.onError);
        if (!cleanResult.ok) return false;
        const validate = meta[name]?.options?.validate;
        const normalized = normalizeCommittedState(name, cleanResult.value, validate, meta[name]?.options?.onError);
        if (!normalized.ok) return false;
        setStoreValueInternal(name, normalized.value);
        initialStates[name] = deepClone(normalized.value);
        delete initialFactories[name]; // Only remove the factory upon success
        return true;
    } catch (err) {
        reportStoreError(name, `Lazy initializer for "${name}" failed: ${(err as { message?: string })?.message ?? err}`);
        // Keep the factory around so a future access can retry it
        return false;
    }
};

export const applyFeatureState = (name: string, value: StoreValue, updatedAtMs = Date.now()): void => {
    setStoreValueInternal(name, value);
    if (!meta[name]) return;
    meta[name].updatedAt = new Date(updatedAtMs).toISOString();
    meta[name].updateCount++;
};

export const getFeatureRuntime = (name: FeatureName): StoreFeatureRuntime | undefined => {
    const existing = featureRuntimes.get(name);
    if (existing) return existing;
    const factory = getStoreFeatureFactory(name);
    if (!factory) return undefined;
    const runtime = factory();
    featureRuntimes.set(name, runtime);
    return runtime;
};

export const warnMissingFeature = (storeName: string, featureName: FeatureName, onError?: (message: string) => void): void => {
    const message =
        `Store "${storeName}" requested ${featureName} support, but "${featureName}" is not registered.\n` +
        `Import "stroid/${featureName}" before calling createStore("${storeName}", ...).`;
    onError?.(message);
    warn(message);
};

export const resolveFeatureAvailability = (name: string, options: NormalizedOptions): NormalizedOptions => {
    const next: NormalizedOptions = { ...options };

    if (next.persist && !hasRegisteredStoreFeature("persist")) {
        if (next.explicitPersist) warnMissingFeature(name, "persist", next.onError);
        next.persist = null;
    }

    if (next.sync && !hasRegisteredStoreFeature("sync")) {
        if (next.explicitSync) warnMissingFeature(name, "sync", next.onError);
        next.sync = false;
    }

    if (!hasRegisteredStoreFeature("devtools")) {
        if (next.explicitDevtools) warnMissingFeature(name, "devtools", next.onError);
        next.devtools = false;
        next.historyLimit = 0;
        next.redactor = undefined;
    }

    return next;
};

export const createBaseFeatureContext = (name: string): BaseFeatureContext | null => {
    const cached = baseFeatureContexts.get(name);
    if (cached) return cached;

    const metaEntry = meta[name];
    if (!metaEntry) {
        warn(`Internal feature context requested for "${name}" after metadata was cleared.`);
        return null;
    }

    const ctx: BaseFeatureContext = {
        name,
        options: metaEntry.options,
        getMeta: () => meta[name],
        getStoreValue: () => stores[name],
        getAllStores: () => stores,
        getInitialState: () => initialStates[name],
        hasStore: () => _hasStoreEntry(_registry, name),
        setStoreValue: (value: StoreValue) => {
            setStoreValueInternal(name, value);
        },
        applyFeatureState: (value: StoreValue, updatedAtMs?: number) => {
            applyFeatureState(name, value, updatedAtMs);
        },
        notify: () => {
            // noop placeholder to be bound by store-notify
        },
        reportStoreError: (message: string) => {
            reportStoreError(name, message);
        },
        warn,
        log,
        hashState,
        deepClone,
        sanitize,
        validate: (next: StoreValue) => runValidation(name, next, meta[name]?.options?.validate),
        isDev,
    };
    baseFeatureContexts.set(name, ctx);
    return ctx;
};

export const runFeatureCreateHooks = (name: string, notify: (name: string) => void): void => {
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    featureRuntimes.forEach((runtime) => {
        runtime.onStoreCreate?.(baseContext);
    });
};

export const runFeatureWriteHooks = (name: string, action: string, prev: StoreValue, next: StoreValue, notify: (name: string) => void): void => {
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    const ctx: FeatureWriteContext = {
        ...baseContext,
        action,
        prev,
        next,
    };

    featureRuntimes.forEach((runtime) => {
        runtime.onStoreWrite?.(ctx);
    });
};

export const runFeatureDeleteHooks = (name: string, prev: StoreValue, notify: (name: string) => void): void => {
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    const ctx: FeatureDeleteContext = {
        ...baseContext,
        prev,
    };
    featureRuntimes.forEach((runtime) => {
        runtime.beforeStoreDelete?.(ctx);
    });
    featureRuntimes.forEach((runtime) => {
        runtime.afterStoreDelete?.(ctx);
    });
    baseFeatureContexts.delete(name);
};

export const runMiddlewareForStore = (
    name: string,
    payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown; }
): StoreValue | typeof MIDDLEWARE_ABORT =>
    runMiddleware({
        name,
        payload,
        middlewares: meta[name]?.options?.middleware || [],
        onError: meta[name]?.options?.onError,
        warn,
    });

export const runStoreHookSafe = (
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
        onError: meta[name]?.options?.onError,
        warn,
    });

export const clearAllRegistries = (): void => {
    clearStoreRegistries(_registry);
};

export const resetFeaturesForTests = (): void => {
    featureRuntimes.forEach((runtime) => {
        try { runtime.resetAll?.(); } catch (_) { /* ignore cleanup errors */ }
    });
    featureRuntimes.clear();
};

export const getMetaEntry = (name: string): MetaEntry | undefined => meta[name];
export const getRegistry = () => _registry;
