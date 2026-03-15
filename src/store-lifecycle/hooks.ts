import { warn, log, hashState, deepClone, sanitize, isDev } from "../utils.js";
import { runMiddleware, runStoreHook, MIDDLEWARE_ABORT } from "../features/lifecycle.js";
import { getConfig } from "../internals/config.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import {
    hasRegisteredStoreFeature,
    type FeatureDeleteContext,
    type FeatureName,
    type FeatureWriteContext,
    type StoreFeatureMeta,
} from "../feature-registry.js";
import type { NormalizedOptions } from "../adapters/options.js";
import type { StoreValue } from "./types.js";
import {
    meta,
    stores,
    initialStates,
    featureRuntimes,
    applyFeatureState,
    getRegistry,
    setStoreValueInternal,
    hasStoreEntryInternal,
} from "./registry.js";
import { runValidation, invalidatePathCache } from "./validation.js";
import { reportStoreError, reportStoreWarning, warnMissingFeature } from "./identity.js";

type BaseFeatureContext = {
    name: string;
    options: StoreFeatureMeta["options"];
    getMeta: () => StoreFeatureMeta | undefined;
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

const baseFeatureContextsByRegistry = new WeakMap<object, Map<string, BaseFeatureContext | null>>();
const getBaseFeatureContexts = (registry: object): Map<string, BaseFeatureContext | null> => {
    let contexts = baseFeatureContextsByRegistry.get(registry);
    if (!contexts) {
        contexts = new Map();
        baseFeatureContextsByRegistry.set(registry, contexts);
    }
    return contexts;
};

export const clearFeatureContexts = (): void => {
    getBaseFeatureContexts(getRegistry()).clear();
};

registerTestResetHook("features.contexts", clearFeatureContexts, 100);

export const createBaseFeatureContext = (name: string): BaseFeatureContext | null => {
    const registry = getRegistry();
    const baseFeatureContexts = getBaseFeatureContexts(registry);
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
        hasStore: () => hasStoreEntryInternal(name),
        setStoreValue: (value: StoreValue) => {
            setStoreValueInternal(name, value);
        },
        applyFeatureState: (value: StoreValue, updatedAtMs?: number) => {
            applyFeatureState(name, value, updatedAtMs);
            invalidatePathCache(name);
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
    const ctx = Object.assign(Object.create(baseContext), {
        action,
        prev,
        next,
    }) as FeatureWriteContext;

    featureRuntimes.forEach((runtime) => {
        runtime.onStoreWrite?.(ctx);
    });
};

export const runFeatureDeleteHooks = (name: string, prev: StoreValue, notify: (name: string) => void): void => {
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    const ctx = Object.assign(Object.create(baseContext), {
        prev,
    }) as FeatureDeleteContext;
    featureRuntimes.forEach((runtime) => {
        runtime.beforeStoreDelete?.(ctx);
    });
    featureRuntimes.forEach((runtime) => {
        runtime.afterStoreDelete?.(ctx);
    });
    getBaseFeatureContexts(getRegistry()).delete(name);
};

export const runMiddlewareForStore = (
    name: string,
    payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown; }
): StoreValue | typeof MIDDLEWARE_ABORT =>
    runMiddleware({
        name,
        payload,
        middlewares: (() => {
            const storeMiddleware = meta[name]?.options?.middleware || [];
            const globalMiddleware = getConfig().middleware || [];
            if (storeMiddleware.length === 0) return globalMiddleware;
            if (globalMiddleware.length === 0) return storeMiddleware;
            // Store-level first, then global middleware as the final gate.
            return [...storeMiddleware, ...globalMiddleware];
        })(),
        reportIssue: (message, visibility) => {
            reportStoreWarning(name, message, visibility);
        },
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
        reportIssue: (message, visibility) => {
            reportStoreWarning(name, message, visibility);
        },
    });

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
