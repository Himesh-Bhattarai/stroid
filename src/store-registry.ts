import type { FeatureName, StoreFeatureMeta, StoreFeatureRuntime } from "./feature-registry.js";

export type RegistryStoreValue = unknown;
export type RegistrySubscriber = (value: RegistryStoreValue | null) => void;
export type RegistrySnapshotEntry = {
    source: RegistryStoreValue;
    snapshot: RegistryStoreValue | null;
};

export type StoreRegistry = {
    stores: Record<string, RegistryStoreValue>;
    subscribers: Record<string, RegistrySubscriber[]>;
    initialStates: Record<string, RegistryStoreValue>;
    metaEntries: Record<string, StoreFeatureMeta>;
    snapshotCache: Record<string, RegistrySnapshotEntry>;
    featureRuntimes: Map<FeatureName, StoreFeatureRuntime>;
    deletingStores: Set<string>;
};

const _registries = new Map<string, StoreRegistry>();

declare const __STROID_REGISTRY_ID__: string | undefined;
const _registryOverride =
    (typeof __STROID_REGISTRY_ID__ !== "undefined" && __STROID_REGISTRY_ID__)
    || (typeof process !== "undefined" && process.env?.STROID_REGISTRY_ID)
    || undefined;

export const normalizeStoreRegistryScope = (scope: string): string => {
    const resolved = _registryOverride || scope;
    return resolved.replace(/\.ts(\?|$)/, ".js$1");
};

export const getStoreRegistry = (scope: string): StoreRegistry => {
    const normalizedScope = normalizeStoreRegistryScope(scope);
    const existing = _registries.get(normalizedScope);
    if (existing) return existing;

    const created: StoreRegistry = {
        stores: Object.create(null),
        subscribers: Object.create(null),
        initialStates: Object.create(null),
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
    [registry.stores, registry.subscribers, registry.initialStates, registry.metaEntries, registry.snapshotCache].forEach((registryPart) => {
        Object.keys(registryPart).forEach((key) => {
            delete registryPart[key];
        });
    });
    registry.deletingStores.clear();
};

export const resetAllStoreRegistriesForTests = (): void => {
    _registries.forEach((registry) => {
        [registry.stores, registry.subscribers, registry.initialStates, registry.metaEntries, registry.snapshotCache].forEach((registryPart) => {
            Object.keys(registryPart).forEach((key) => {
                delete registryPart[key];
            });
        });
        registry.deletingStores.clear();
    });
    _registries.clear();
};
