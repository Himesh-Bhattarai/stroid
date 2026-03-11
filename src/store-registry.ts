/**
 * @module store-registry
 *
 * LAYER: Dumb Data Container
 * OWNS:  The shape of a StoreRegistry, the global map of all scoped registries,
 *        and the SSR carrier-context injection point.
 *
 * DOES NOT KNOW about: validation, features, hooks, React, or any write logic.
 * It is a plain key-value store factory — nothing more.
 *
 * Consumers: store-lifecycle (binds a registry scope on startup / SSR switch).
 */
import type { FeatureName, StoreFeatureMeta, StoreFeatureRuntime } from "./feature-registry.js";

export type RegistryStoreValue = unknown;
export type RegistrySubscriber = (value: RegistryStoreValue | null) => void;
export type RegistrySnapshotEntry = {
    version: number;
    snapshot: RegistryStoreValue | null;
};

export type StoreRegistry = {
    stores: Record<string, RegistryStoreValue>;
    subscribers: Record<string, RegistrySubscriber[]>;
    initialStates: Record<string, RegistryStoreValue>;
    initialFactories: Record<string, (() => RegistryStoreValue) | undefined>;
    metaEntries: Record<string, StoreFeatureMeta>;
    snapshotCache: Record<string, RegistrySnapshotEntry>;
    featureRuntimes: Map<FeatureName, StoreFeatureRuntime>;
    deletingStores: Set<string>;
};

const _registries = new Map<string, StoreRegistry>();

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

export const getStoreRegistry = (scope: string): StoreRegistry => {
    const normalizedScope = normalizeStoreRegistryScope(scope);
    const existing = _registries.get(normalizedScope);
    if (existing) return existing;

    const created: StoreRegistry = {
        stores: Object.create(null),
        subscribers: Object.create(null),
        initialStates: Object.create(null),
        initialFactories: Object.create(null),
        metaEntries: Object.create(null),
        snapshotCache: Object.create(null),
        featureRuntimes: new Map(),
        deletingStores: new Set(),
    };
    _registries.set(normalizedScope, created);
    return created;
};

export const hasStoreEntry = (registry: StoreRegistry, name: string): boolean =>
    Object.prototype.hasOwnProperty.call(registry.stores, name);

export const isStoreDeleting = (registry: StoreRegistry, name: string): boolean =>
    registry.deletingStores.has(name);

export const clearStoreRegistries = (registry: StoreRegistry): void => {
    [registry.stores, registry.subscribers, registry.initialStates, registry.initialFactories, registry.metaEntries, registry.snapshotCache].forEach((registryPart) => {
        Object.keys(registryPart).forEach((key) => {
            delete registryPart[key];
        });
    });
    registry.deletingStores.clear();
};

export const resetAllStoreRegistriesForTests = (): void => {
    _registries.forEach((registry) => {
        [registry.stores, registry.subscribers, registry.initialStates, registry.initialFactories, registry.metaEntries, registry.snapshotCache].forEach((registryPart) => {
            Object.keys(registryPart).forEach((key) => {
                delete registryPart[key];
            });
        });
        registry.deletingStores.clear();
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
