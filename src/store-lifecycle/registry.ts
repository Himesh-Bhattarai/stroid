/**
 * @module store-lifecycle/registry
 *
 * LAYER: Store lifecycle
 * OWNS:  Module-level behavior and exports for store-lifecycle/registry.
 *
 * Consumers: Internal imports and public API.
 */
import { devDeepFreeze } from "../devfreeze.js";
import { isDev } from "../utils.js";
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
    type StoreRegistry,
} from "../store-registry.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import {
    getStoreFeatureFactory,
    getRegisteredFeatureNames,
    setFeatureRegistrationHook,
    type FeatureName,
    type StoreFeatureRuntime,
    type StoreFeatureMeta,
} from "../feature-registry.js";
import { createStoreAdmin } from "../internals/store-admin.js";
import type { StoreValue, Subscriber } from "./types.js";
import { getStagedTransactionValue, isTransactionActive } from "../store-transaction.js";

export { defaultRegistryScope } from "../store-registry.js";

let _scope = defaultRegistryScope;
let _defaultRegistry = getStoreRegistry(_scope);
var _invalidatePathCache: ((name: string) => void) | null = null;
const initializedRegistries = new WeakSet<StoreRegistry>();
const initializeRegistryFeatureRuntimes = (registry: StoreRegistry): void => {
    if (initializedRegistries.has(registry)) return;
    initializedRegistries.add(registry);
    getRegisteredFeatureNames().forEach((name) => {
        if (!registry.featureRuntimes.get(name)) {
            const factory = getStoreFeatureFactory(name);
            if (factory) registry.featureRuntimes.set(name, factory());
        }
    });
};

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

export function setPathCacheInvalidator(fn: (name: string) => void): void {
    _invalidatePathCache = fn;
}

const createRegistryObjectProxy = <T extends object>(getter: () => T): T =>
    new Proxy(Object.create(null), {
        get: (_target, prop) => (getter() as any)[prop],
        set: (_target, prop, value) => {
            (getter() as any)[prop] = value;
            return true;
        },
        deleteProperty: (_target, prop) => {
            delete (getter() as any)[prop];
            return true;
        },
        has: (_target, prop) => prop in (getter() as any),
        ownKeys: () => Reflect.ownKeys(getter()),
        getOwnPropertyDescriptor: (_target, prop) => {
            const desc = Object.getOwnPropertyDescriptor(getter(), prop);
            if (!desc) return undefined;
            return { ...desc, configurable: true };
        },
    }) as T;

const createRegistryMapProxy = <T extends Map<any, any>>(getter: () => T): T =>
    new Proxy(new Map(), {
        get: (_target, prop) => {
            const target = getter() as any;
            if (prop === "size") return target.size;
            if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target);
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
        set: (_target, prop, value) => {
            (getter() as any)[prop] = value;
            return true;
        },
    }) as T;

const createRegistryValueProxy = <T extends object>(getter: () => T): T =>
    new Proxy({} as T, {
        get: (_target, prop) => {
            const target = getter() as any;
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
        set: (_target, prop, value) => {
            (getter() as any)[prop] = value;
            return true;
        },
    });

export const stores = createRegistryObjectProxy(() => getActiveRegistry().stores as Record<string, StoreValue>);
export const subscribers = createRegistryObjectProxy(() => getActiveRegistry().subscribers as Record<string, Set<Subscriber>>);
export const initialStates = createRegistryObjectProxy(() => getActiveRegistry().initialStates as Record<string, StoreValue>);
export const initialFactories = createRegistryObjectProxy(() => getActiveRegistry().initialFactories as Record<string, (() => StoreValue) | undefined>);
export const meta = createRegistryObjectProxy(() => getActiveRegistry().metaEntries as Record<string, StoreFeatureMeta>);
export const snapshotCache = createRegistryObjectProxy(() => getActiveRegistry().snapshotCache as Record<string, { version: number; snapshot: StoreValue | null }>);
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

export const hasStoreEntryInternal = (name: string): boolean => _hasStoreEntry(getActiveRegistry(), name);

export const getStoreValueRef = (name: string): StoreValue | undefined => {
    if (isTransactionActive()) {
        const staged = getStagedTransactionValue(name);
        if (staged.has) return staged.value;
    }
    const carrier = getRequestCarrier();
    if (carrier && Object.prototype.hasOwnProperty.call(carrier, name)) {
        return carrier[name] as StoreValue;
    }
    return stores[name];
};

export const setStoreValueInternal = (name: string, value: StoreValue): void => {
    const carrier = getRequestCarrier();
    const frozen = isDev() ? devDeepFreeze(value) : value;
    if (carrier) {
        carrier[name] = frozen;
        if (!Object.prototype.hasOwnProperty.call(stores, name)) {
            stores[name] = undefined;
        }
    } else {
        stores[name] = frozen;
    }
};

export const applyFeatureState = (name: string, value: StoreValue, updatedAtMs = Date.now()): void => {
    setStoreValueInternal(name, value);
    if (!meta[name]) return;
    meta[name].updatedAt = new Date(updatedAtMs).toISOString();
    meta[name].updatedAtMs = updatedAtMs;
    meta[name].updateCount++;
    _invalidatePathCache?.(name);
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


