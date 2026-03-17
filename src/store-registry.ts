/**
 * @module store-registry
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-registry.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getRegisteredFeatureNames,
    getStoreFeatureFactory,
    type FeatureName,
    type StoreFeatureMeta,
    type StoreFeatureRuntime,
} from "./feature-registry.js";
import type { AsyncRegistry } from "./async-registry.js";
import { createAsyncRegistry, resetAsyncRegistry } from "./async-registry.js";
import { registerTestResetHook } from "./internals/test-reset.js";

export type RegistryStoreValue = unknown;
export type RegistrySubscriber = (value: RegistryStoreValue | null) => void;
export type RegistrySnapshotEntry = {
    version: number;
    snapshot: RegistryStoreValue | null;
    source?: RegistryStoreValue | null;
    mode?: "deep" | "shallow" | "ref";
};

export type TransactionState = {
    depth: number;
    pending: Array<() => void>;
    stagedValues: Map<string, RegistryStoreValue>;
    snapshotCache: Map<string, TransactionSnapshotEntry>;
    failed: boolean;
    error?: Error;
};

type TransactionSnapshotMode = "deep" | "shallow" | "ref";
type TransactionSnapshotEntry = {
    source: RegistryStoreValue | null | undefined;
    snapshot: RegistryStoreValue | null;
    mode: TransactionSnapshotMode;
};

export type ComputedEntry = {
    deps: string[];
    compute: (...args: unknown[]) => unknown;
    stale: boolean;
};

export type NotifyState = {
    pendingNotifications: Set<string>;
    pendingBuffer: string[];
    orderedNames: string[];
    notifyScheduled: boolean;
    batchDepth: number;
    flushId: number;
    isFlushing: boolean;
};

export type RegistryScope = "default" | "request";

export type StoreRegistry = {
    scope: RegistryScope;
    stores: Record<string, RegistryStoreValue>;
    subscribers: Record<string, Set<RegistrySubscriber>>;
    initialStates: Record<string, RegistryStoreValue>;
    initialFactories: Record<string, (() => RegistryStoreValue) | undefined>;
    metaEntries: Record<string, StoreFeatureMeta>;
    snapshotCache: Record<string, RegistrySnapshotEntry>;
    featureRuntimes: Map<FeatureName, StoreFeatureRuntime>;
    deletingStores: Set<string>;
    computedEntries: Record<string, ComputedEntry>;
    computedDependents: Record<string, Set<string>>;
    computedCleanups: Map<string, () => void>;
    transaction: TransactionState;
    async: AsyncRegistry;
    notify: NotifyState;
};

const _registries = new Map<string, StoreRegistry>();
const initializedRegistries = new WeakSet<StoreRegistry>();

export const initializeRegistryFeatureRuntimes = (registry: StoreRegistry): void => {
    if (initializedRegistries.has(registry)) return;
    initializedRegistries.add(registry);
    getRegisteredFeatureNames().forEach((name) => {
        if (!registry.featureRuntimes.get(name)) {
            const factory = getStoreFeatureFactory(name);
            if (factory) registry.featureRuntimes.set(name, factory());
        }
    });
};

declare const __STROID_REGISTRY_ID__: string | undefined;
const _registryOverrideEnv =
    (typeof __STROID_REGISTRY_ID__ !== "undefined" && __STROID_REGISTRY_ID__)
    || (typeof process !== "undefined" && process.env?.STROID_REGISTRY_ID)
    || undefined;

let _registryOverrideRuntime: string | undefined;

export const normalizeStoreRegistryScope = (scope: string): string => {
    const resolved = _registryOverrideRuntime || _registryOverrideEnv || scope;
    return resolved.replace(/\.ts(\?|$)/, ".js$1");
};

export const defaultRegistryScope = normalizeStoreRegistryScope(new URL("./store.js", import.meta.url).href);
export const getDefaultStoreRegistry = (): StoreRegistry => getStoreRegistry(defaultRegistryScope);

export const setRegistryScope = (scope: string): void => {
    _registryOverrideRuntime = scope;
    _registries.clear();
};

export const clearRegistryScopeOverrideForTests = (): void => {
    _registryOverrideRuntime = undefined;
    _registries.clear();
};

registerTestResetHook("registry.scope-override", clearRegistryScopeOverrideForTests, 110);

const createNotifyState = (): NotifyState => ({
    pendingNotifications: new Set<string>(),
    pendingBuffer: [],
    orderedNames: [],
    notifyScheduled: false,
    batchDepth: 0,
    flushId: 0,
    isFlushing: false,
});

const resetNotifyState = (notify: NotifyState): void => {
    notify.pendingNotifications.clear();
    notify.pendingBuffer.length = 0;
    notify.orderedNames.length = 0;
    notify.notifyScheduled = false;
    notify.batchDepth = 0;
    notify.flushId = 0;
    notify.isFlushing = false;
};

export const createTransactionState = (): TransactionState => ({
    depth: 0,
    pending: [],
    stagedValues: new Map(),
    snapshotCache: new Map(),
    failed: false,
    error: undefined,
});

export const createStoreRegistry = (scope: RegistryScope = "default"): StoreRegistry => {
    const registry: StoreRegistry = {
        scope,
        stores: Object.create(null),
        subscribers: Object.create(null),
        initialStates: Object.create(null),
        initialFactories: Object.create(null),
        metaEntries: Object.create(null),
        snapshotCache: Object.create(null),
        featureRuntimes: new Map(),
        deletingStores: new Set(),
        computedEntries: Object.create(null),
        computedDependents: Object.create(null),
        computedCleanups: new Map(),
        transaction: createTransactionState(),
        async: createAsyncRegistry(),
        notify: createNotifyState(),
    };
    initializeRegistryFeatureRuntimes(registry);
    return registry;
};

export const getStoreRegistry = (scope: string): StoreRegistry => {
    const normalizedScope = normalizeStoreRegistryScope(scope);
    const existing = _registries.get(normalizedScope);
    if (existing) return existing;
    const created = createStoreRegistry();
    _registries.set(normalizedScope, created);
    return created;
};

export const hasStoreEntry = (registry: StoreRegistry, name: string): boolean =>
    Object.prototype.hasOwnProperty.call(registry.stores, name);

export const isStoreDeleting = (registry: StoreRegistry, name: string): boolean =>
    registry.deletingStores.has(name);

export const clearStoreRegistries = (registry: StoreRegistry): void => {
    registry.computedCleanups.forEach((cleanup) => {
        try { cleanup(); } catch (_) { /* ignore cleanup errors */ }
    });
    registry.computedCleanups.clear();
    [
        registry.stores,
        registry.subscribers,
        registry.initialStates,
        registry.initialFactories,
        registry.metaEntries,
        registry.snapshotCache,
        registry.computedEntries,
        registry.computedDependents,
    ].forEach((registryPart) => {
        Object.keys(registryPart).forEach((key) => {
            delete registryPart[key];
        });
    });
    registry.deletingStores.clear();
    registry.transaction.depth = 0;
    registry.transaction.pending = [];
    registry.transaction.stagedValues.clear();
    registry.transaction.snapshotCache.clear();
    registry.transaction.failed = false;
    registry.transaction.error = undefined;
    resetNotifyState(registry.notify);
    resetAsyncRegistry(registry.async);
};

export const resetAllStoreRegistriesForTests = (): void => {
    _registries.forEach((registry) => {
        registry.computedCleanups.forEach((cleanup) => {
            try { cleanup(); } catch (_) { /* ignore cleanup errors */ }
        });
        registry.computedCleanups.clear();
        [
            registry.stores,
            registry.subscribers,
            registry.initialStates,
            registry.initialFactories,
            registry.metaEntries,
            registry.snapshotCache,
            registry.computedEntries,
            registry.computedDependents,
        ].forEach((registryPart) => {
            Object.keys(registryPart).forEach((key) => {
                delete registryPart[key];
            });
        });
        registry.deletingStores.clear();
        registry.transaction.depth = 0;
        registry.transaction.pending = [];
        registry.transaction.stagedValues.clear();
        registry.transaction.snapshotCache.clear();
        registry.transaction.failed = false;
        registry.transaction.error = undefined;
        resetNotifyState(registry.notify);
        resetAsyncRegistry(registry.async);
    });
    _registries.clear();
};

export type CarrierContext = Record<string, unknown>;
export interface CarrierRunner {
    run<T>(carrier: CarrierContext, fn: () => T): T;
    get(): CarrierContext | null;
}

let currentCarrierRunner: CarrierRunner | null = null;

export const injectCarrierRunner = (runner: CarrierRunner): void => {
    currentCarrierRunner = runner;
};

export const getRequestCarrier = (): CarrierContext | null => {
    return currentCarrierRunner?.get() || null;
};

export interface RegistryRunner {
    run<T>(registry: StoreRegistry, fn: () => T): T;
    get(): StoreRegistry | null;
    enterWith?: (registry: StoreRegistry) => void;
}

let currentRegistryRunner: RegistryRunner | null = null;

export const injectRegistryRunner = (runner: RegistryRunner): void => {
    currentRegistryRunner = runner;
};

export const runWithRegistry = <T>(registry: StoreRegistry, fn: () => T): T => {
    if (currentRegistryRunner?.run) return currentRegistryRunner.run(registry, fn);
    return fn();
};

export const getActiveStoreRegistry = (fallback?: StoreRegistry): StoreRegistry => {
    return currentRegistryRunner?.get() || fallback || getStoreRegistry(defaultRegistryScope);
};

export const enterRegistry = (registry: StoreRegistry): void => {
    if (currentRegistryRunner?.enterWith) {
        currentRegistryRunner.enterWith(registry);
    }
};


