/**
 * @fileoverview src\feature-registry.ts
 */
import type { NormalizedOptions, StoreValue } from "./adapters/options.js";

export type BuiltInFeatureName = "persist" | "sync" | "devtools";
export type FeatureName = BuiltInFeatureName | (string & {});

export interface FeatureMetrics {
    notifyCount: number;
    totalNotifyMs: number;
    lastNotifyMs: number;
}

export interface StoreFeatureMeta {
    createdAt: string;
    updatedAt: string;
    updatedAtMs: number;
    updateCount: number;
    version: number;
    metrics: FeatureMetrics;
    options: NormalizedOptions;
}

export interface BaseFeatureContext {
    name: string;
    options: NormalizedOptions;
    getMeta: () => StoreFeatureMeta | undefined;
    getStoreValue: () => StoreValue;
    getAllStores: () => Record<string, StoreValue>;
    getInitialState: () => StoreValue;
    hasStore: () => boolean;
    setStoreValue: (value: StoreValue) => void;
    applyFeatureState: (value: StoreValue, updatedAtMs?: number) => void;
    notify: () => void;
    reportStoreError: (message: string) => void;
    warn: (message: string) => void;
    log: (message: string) => void;
    hashState: (value: unknown) => number;
    deepClone: <T>(value: T) => T;
    sanitize: (value: unknown) => unknown;
    validate: (next: StoreValue) => { ok: boolean; value?: StoreValue };
    isDev: () => boolean;
}

export interface FeatureCreateContext extends BaseFeatureContext {}

export interface FeatureWriteContext extends BaseFeatureContext {
    action: string;
    prev: StoreValue;
    next: StoreValue;
}

export interface FeatureDeleteContext extends BaseFeatureContext {
    prev: StoreValue;
}

export interface DevtoolsFeatureApi {
    getHistory?: (name: string, limit?: number) => unknown[];
    clearHistory?: (name?: string) => void;
    getPersistQueueDepth?: (name: string) => number;
}

export interface StoreFeatureRuntime {
    onStoreCreate?: (ctx: FeatureCreateContext) => void;
    onStoreWrite?: (ctx: FeatureWriteContext) => void;
    beforeStoreDelete?: (ctx: FeatureDeleteContext) => void;
    afterStoreDelete?: (ctx: FeatureDeleteContext) => void;
    resetAll?: () => void;
    api?: DevtoolsFeatureApi;
}

export type StoreFeatureFactory = () => StoreFeatureRuntime;

const _featureFactories = new Map<FeatureName, StoreFeatureFactory>();
let _onFeatureRegistered: ((name: FeatureName, factory: StoreFeatureFactory) => void) | null = null;

export const registerStoreFeature = (name: FeatureName, factory: StoreFeatureFactory): void => {
    _featureFactories.set(name, factory);
    _onFeatureRegistered?.(name, factory);
};

export const hasRegisteredStoreFeature = (name: FeatureName): boolean =>
    _featureFactories.has(name);

export const getStoreFeatureFactory = (name: FeatureName): StoreFeatureFactory | undefined =>
    _featureFactories.get(name);

export const getRegisteredFeatureNames = (): FeatureName[] =>
    Array.from(_featureFactories.keys());

export const setFeatureRegistrationHook = (hook: ((name: FeatureName, factory: StoreFeatureFactory) => void) | null): void => {
    _onFeatureRegistered = hook;
};

export const resetRegisteredStoreFeaturesForTests = (): void => {
    _featureFactories.clear();
    _onFeatureRegistered = null;
};

