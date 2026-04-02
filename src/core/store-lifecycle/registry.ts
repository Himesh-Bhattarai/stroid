/**
 * @module store-lifecycle/registry
 *
 * LAYER: Store lifecycle
 * OWNS:  Module-level behavior and exports for store-lifecycle/registry.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getStoreRegistry,
    hasStoreEntry as _hasStoreEntry,
    isStoreDeleting,
    clearStoreRegistries,
    normalizeStoreRegistryScope,
    defaultRegistryScope,
    getRequestCarrier,
    getActiveStoreRegistry,
    enterRegistry,
    initializeRegistryFeatureRuntimes,
    type StoreRegistry,
    type StoreLifecycleEvent,
    type StoreLifecycleListener,
    emitLifecycleEvent,
    setLifecycleListener,
} from "../store-registry.js";
import { registerTestResetHook } from "../../internals/test-reset.js";
import { warn } from "../../internals/diagnostics.js";
import {
    getStoreFeatureFactory,
    getRegisteredFeatureNames,
    setFeatureRegistrationHook,
    type FeatureName,
    type StoreFeatureRuntime,
    type StoreFeatureMeta,
} from "../../features/feature-registry.js";
import { createStoreAdmin } from "../../internals/store-admin.js";
import type { StoreValue, Subscriber } from "./types.js";
import { getStagedTransactionValue, isTransactionActive } from "../store-transaction.js";
import {
    enqueueHydrationWrite,
    reconcileHydrationValue,
    runHydrationInvalidationHandler,
    shouldQueueHydrationWrite,
    type HydrationConsistencySource,
} from "../hydration-consistency.js";

export { defaultRegistryScope } from "../store-registry.js";
export type { StoreLifecycleEvent } from "../store-registry.js";

let _scope = defaultRegistryScope;
let _defaultRegistry = getStoreRegistry(_scope);
var _invalidatePathCache: ((name: string) => void) | null = null;

const getActiveRegistry = (): StoreRegistry => {
    const registry = getActiveStoreRegistry(_defaultRegistry);
    initializeRegistryFeatureRuntimes(registry);
    return registry;
};

export const setRegistryContext = (scope: string, registry: StoreRegistry): void => {
    _scope = scope;
    _defaultRegistry = registry;
    enterRegistry(registry);
};

export const getRegistry = (): StoreRegistry => getActiveRegistry();

export const onStoreLifecycle = (fn: StoreLifecycleListener | null): (() => void) => {
    const registry = getActiveRegistry();
    setLifecycleListener(registry, fn);
    return () => {
        if (registry.lifecycleListener === fn) {
            setLifecycleListener(registry, null);
        }
    };
};

export const emitStoreLifecycle = (registry: StoreRegistry, event: StoreLifecycleEvent): void => {
    emitLifecycleEvent(registry, event);
};

export function setPathCacheInvalidator(fn: (name: string) => void): void {
    _invalidatePathCache = fn;
}

const createRegistryObjectProxy = <T extends object>(getter: () => T): T =>
    // Proxy so imports can reference a stable object while SSR swaps the active registry per request.
    new Proxy(Object.create(null), {
        get: (_target, prop) => (getter() as unknown as Record<PropertyKey, unknown>)[prop],
        set: (_target, prop, value) => {
            (getter() as unknown as Record<PropertyKey, unknown>)[prop] = value;
            return true;
        },
        deleteProperty: (_target, prop) => {
            delete (getter() as unknown as Record<PropertyKey, unknown>)[prop];
            return true;
        },
        has: (_target, prop) => prop in (getter() as unknown as Record<PropertyKey, unknown>),
        ownKeys: () => Reflect.ownKeys(getter()),
        getOwnPropertyDescriptor: (_target, prop) => {
            const desc = Object.getOwnPropertyDescriptor(getter(), prop);
            if (!desc) return undefined;
            return { ...desc, configurable: true };
        },
    }) as T;

const createRegistryMapProxy = <T extends Map<unknown, unknown>>(getter: () => T): T =>
    new Proxy(new Map(), {
        get: (_target, prop) => {
            const target = getter();
            if (prop === "size") return target.size;
            if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target);
            const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
            return typeof value === "function"
                ? (value as (...args: unknown[]) => unknown).bind(target)
                : value;
        },
        set: (_target, prop, value) => {
            (getter() as unknown as Record<PropertyKey, unknown>)[prop] = value;
            return true;
        },
    }) as T;

const createRegistryValueProxy = <T extends object>(getter: () => T): T =>
    new Proxy({} as T, {
        get: (_target, prop) => {
            const target = getter();
            const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
            return typeof value === "function"
                ? (value as (...args: unknown[]) => unknown).bind(target)
                : value;
        },
        set: (_target, prop, value) => {
            (getter() as unknown as Record<PropertyKey, unknown>)[prop] = value;
            return true;
        },
    });

export const stores = createRegistryObjectProxy(() => getActiveRegistry().stores as Record<string, StoreValue>);
export const subscribers = createRegistryObjectProxy(() => getActiveRegistry().subscribers as Record<string, Set<Subscriber>>);
export const initialStates = createRegistryObjectProxy(() => getActiveRegistry().initialStates as Record<string, StoreValue>);
export const initialFactories = createRegistryObjectProxy(() => getActiveRegistry().initialFactories as Record<string, (() => StoreValue) | undefined>);
export const meta = createRegistryObjectProxy(() => getActiveRegistry().metaEntries as Record<string, StoreFeatureMeta>);
export const snapshotCache = createRegistryObjectProxy(
    () => getActiveRegistry().snapshotCache as Record<string, { version: number; snapshot: StoreValue | null; source?: StoreValue | null; mode?: "deep" | "shallow" | "ref" }>
);
export const featureRuntimes = createRegistryMapProxy(() => getActiveRegistry().featureRuntimes as Map<FeatureName, StoreFeatureRuntime>);

const storeAdminByRegistry = new WeakMap<StoreRegistry, ReturnType<typeof createStoreAdmin>>();
const getStoreAdminForRegistry = (registry: StoreRegistry): ReturnType<typeof createStoreAdmin> => {
    let admin = storeAdminByRegistry.get(registry);
    if (!admin) {
        admin = createStoreAdmin(registry);
        storeAdminByRegistry.set(registry, admin);
    }
    return admin;
};
export const storeAdmin = createRegistryValueProxy(() => getStoreAdminForRegistry(getActiveRegistry()));
export const getStoreAdmin = (): ReturnType<typeof createStoreAdmin> =>
    getStoreAdminForRegistry(getActiveRegistry());

export const getFeatureRuntime = (name: FeatureName): StoreFeatureRuntime | undefined => {
    const existing = featureRuntimes.get(name);
    if (existing) return existing;
    const factory = getStoreFeatureFactory(name);
    if (!factory) return undefined;
    const runtime = factory();
    featureRuntimes.set(name, runtime);
    return runtime;
};

export const initializeRegisteredFeatureRuntimes = (): void => {
    getRegisteredFeatureNames().forEach((name) => {
        getFeatureRuntime(name);
    });
};

setFeatureRegistrationHook((name, factory) => {
    if (!featureRuntimes.get(name)) {
        featureRuntimes.set(name, factory());
    }
});
initializeRegisteredFeatureRuntimes();

export const hasStoreEntryInternal = (name: string, registry?: StoreRegistry): boolean =>
    _hasStoreEntry(registry ?? getActiveRegistry(), name);

export const getStoreValueRef = (name: string, registry: StoreRegistry = getActiveRegistry()): StoreValue | undefined => {
    if (isTransactionActive()) {
        const staged = getStagedTransactionValue(name);
        if (staged.has) return staged.value;
    }
    return getCommittedStoreValueRef(name, registry);
};

export const getCommittedStoreValueRef = (
    name: string,
    registry: StoreRegistry = getActiveRegistry()
): StoreValue | undefined => {
    const carrier = getRequestCarrier();
    if (carrier && Object.prototype.hasOwnProperty.call(carrier, name)) {
        return carrier[name] as StoreValue;
    }
    return registry.stores[name];
};

export const setStoreValueInternal = (name: string, value: StoreValue, registry: StoreRegistry = getActiveRegistry()): void => {
    const carrier = getRequestCarrier();
    if (carrier) {
        carrier[name] = value;
        if (!Object.prototype.hasOwnProperty.call(registry.stores, name)) {
            registry.stores[name] = undefined;
        }
    } else {
        registry.stores[name] = value;
    }
};

export const applyFeatureState = (
    name: string,
    value: StoreValue,
    updatedAtMs = Date.now(),
    options: {
        source?: HydrationConsistencySource;
        validate?: (candidate: StoreValue) => { ok: boolean; value?: StoreValue };
        bypassHydrationQueue?: boolean;
    } = {}
): StoreValue => {
    const registry = getActiveRegistry();
    const source = options.source ?? "unknown";
    if (!options.bypassHydrationQueue && shouldQueueHydrationWrite(registry, name, source)) {
        enqueueHydrationWrite(registry, name, source, () => {
            applyFeatureState(name, value, updatedAtMs, {
                ...options,
                bypassHydrationQueue: true,
            });
        });
        return value;
    }
    const reconciled = reconcileHydrationValue({
        registry,
        store: name,
        value,
        source,
        normalize: options.validate,
    });
    const nextValue = reconciled.value as StoreValue;
    setStoreValueInternal(name, nextValue, registry);
    if (!meta[name]) return nextValue;
    meta[name].updatedAt = new Date(updatedAtMs).toISOString();
    meta[name].updatedAtMs = updatedAtMs;
    meta[name].lastCorrelationId = null;
    meta[name].lastCorrelationAt = null;
    meta[name].lastCorrelationAtMs = null;
    meta[name].lastTraceContext = null;
    if (meta[name].updateCount >= Number.MAX_SAFE_INTEGER) {
        meta[name].updateCount = 0;
    } else {
        meta[name].updateCount += 1;
    }
    _invalidatePathCache?.(name);
    if (reconciled.invalidated) {
        runHydrationInvalidationHandler(registry, name, reconciled.event?.live ?? value, source);
        if (reconciled.needsRefetch && registry.async.fetchRegistry[name]) {
            queueMicrotask(() => {
                void import("../../async/fetch.js")
                    .then(async ({ refetchStore }) => {
                        await refetchStore({ name } as { name: string });
                    })
                    .catch((error) => {
                        warn(
                            `Post-hydration refetch for "${name}" failed: ${(error as { message?: string })?.message ?? error}`
                        );
                    });
            });
        }
    }
    return nextValue;
};

export const recordStoreRead = (name: string, registry: StoreRegistry = getActiveRegistry()): void => {
    const metaEntry = registry.metaEntries[name];
    if (!metaEntry) return;
    metaEntry.readCount = (metaEntry.readCount ?? 0) + 1;
    const now = Date.now();
    metaEntry.lastReadAtMs = now;
    metaEntry.lastReadAt = new Date(now).toISOString();
};

export const clearAllRegistries = (): void => {
    clearStoreRegistries(getActiveRegistry());
};

export const resetFeaturesForTests = (): void => {
    featureRuntimes.forEach((runtime) => {
        try { runtime.resetAll?.(); } catch (_) { /* ignore cleanup errors */ }
    });
    featureRuntimes.clear();
};

registerTestResetHook("features.reset", resetFeaturesForTests, 10);
registerTestResetHook("registries.clear", clearAllRegistries, 20);
registerTestResetHook("registry.default", () => {
    _scope = defaultRegistryScope;
    _defaultRegistry = getStoreRegistry(_scope);
}, 115);

export const getMetaEntry = (name: string): StoreFeatureMeta | undefined => meta[name];

export const isDeleting = (name: string): boolean =>
    isStoreDeleting(getActiveRegistry(), name);

export const resolveScope = (scopeOrRegistry?: string | ReturnType<typeof getStoreRegistry>): { scope: string; registry: StoreRegistry } => {
    const resolvedScope = typeof scopeOrRegistry === "string"
        ? normalizeStoreRegistryScope(scopeOrRegistry)
        : _scope;
    const registry = typeof scopeOrRegistry === "string"
        ? getStoreRegistry(resolvedScope)
        : scopeOrRegistry ?? getStoreRegistry(_scope);
    return { scope: resolvedScope, registry };
};
