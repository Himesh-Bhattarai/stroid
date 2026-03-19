/**
 * @module feature-registry
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for feature-registry.
 *
 * Consumers: Internal imports and public API.
 */
import type { NormalizedOptions, StoreValue } from "../adapters/options.js";
import type { TraceContext } from "../types/utility.js";

export type BuiltInFeatureName = "persist" | "sync" | "devtools";
export type FeatureName = BuiltInFeatureName | (string & {});

export interface FeatureMetrics {
    notifyCount: number;
    totalNotifyMs: number;
    lastNotifyMs: number;
    resetCount: number;
    totalResetMs: number;
    lastResetMs: number;
}

export interface StoreFeatureMeta {
    createdAt: string;
    updatedAt: string;
    updatedAtMs: number;
    updateCount: number;
    version: number;
    metrics: FeatureMetrics;
    options: NormalizedOptions;
    readCount: number;
    lastReadAt: string | null;
    lastReadAtMs: number | null;
    lastCorrelationId: string | null;
    lastCorrelationAt: string | null;
    lastCorrelationAtMs: number | null;
    lastTraceContext: TraceContext | null;
}

export interface FeatureHookContext {
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
    warnAlways: (message: string) => void;
    log: (message: string) => void;
    hashState: (value: unknown) => number;
    deepClone: <T>(value: T) => T;
    sanitize: (value: unknown) => unknown;
    validate: (next: StoreValue) => { ok: boolean; value?: StoreValue };
    isDev: () => boolean;
}

/** @deprecated Use FeatureHookContext instead. */
export type BaseFeatureContext = FeatureHookContext;

export type FeatureCreateContext<Ext extends object = {}> = FeatureHookContext & Ext;

export type FeatureWriteContext<Ext extends object = {}> = FeatureHookContext & Ext & {
    action: string;
    prev: StoreValue;
    next: StoreValue;
};

export type FeatureDeleteContext<Ext extends object = {}> = FeatureHookContext & Ext & {
    prev: StoreValue;
};

export interface DevtoolsFeatureApi {
    getHistory?: (name: string, limit?: number) => unknown[];
    clearHistory?: (name?: string) => void;
    getPersistQueueDepth?: (name: string) => number;
}

export interface StoreFeatureRuntime<Ext extends object = {}> {
    onStoreCreate?: (ctx: FeatureCreateContext<Ext>) => void;
    onStoreWrite?: (ctx: FeatureWriteContext<Ext>) => void;
    beforeStoreDelete?: (ctx: FeatureDeleteContext<Ext>) => void;
    afterStoreDelete?: (ctx: FeatureDeleteContext<Ext>) => void;
    resetAll?: () => void;
    api?: DevtoolsFeatureApi;
}

export type StoreFeatureFactory<Ext extends object = {}> = () => StoreFeatureRuntime<Ext>;

const _featureFactories = new Map<FeatureName, StoreFeatureFactory<any>>();
let _onFeatureRegistered: ((name: FeatureName, factory: StoreFeatureFactory<any>) => void) | null = null;

export const registerStoreFeature = <Ext extends object = {}>(
    name: FeatureName,
    factory: StoreFeatureFactory<Ext>
): void => {
    _featureFactories.set(name, factory as StoreFeatureFactory<any>);
    _onFeatureRegistered?.(name, factory as StoreFeatureFactory<any>);
};

export const hasRegisteredStoreFeature = (name: FeatureName): boolean =>
    _featureFactories.has(name);

export const getStoreFeatureFactory = (name: FeatureName): StoreFeatureFactory<any> | undefined =>
    _featureFactories.get(name);

export const getRegisteredFeatureNames = (): FeatureName[] =>
    Array.from(_featureFactories.keys());

export const setFeatureRegistrationHook = (hook: ((name: FeatureName, factory: StoreFeatureFactory<any>) => void) | null): void => {
    _onFeatureRegistered = hook;
};

export const resetRegisteredStoreFeaturesForTests = (): void => {
    _featureFactories.clear();
    _onFeatureRegistered = null;
};


