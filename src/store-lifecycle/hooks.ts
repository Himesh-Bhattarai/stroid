/**
 * @module store-lifecycle/hooks
 *
 * LAYER: Store lifecycle
 * OWNS:  Module-level behavior and exports for store-lifecycle/hooks.
 *
 * Consumers: Internal imports and public API.
 */
import { warn, log, hashState, deepClone, sanitize, isDev } from "../utils.js";
import { runMiddleware, runStoreHook, MIDDLEWARE_ABORT } from "../features/lifecycle.js";
import { getConfig } from "../internals/config.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import {
    hasRegisteredStoreFeature,
    type FeatureDeleteContext,
    type FeatureHookContext,
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
    initializeRegisteredFeatureRuntimes,
    setStoreValueInternal,
    hasStoreEntryInternal,
} from "./registry.js";
import { runValidation, invalidatePathCache } from "./validation.js";
import { reportStoreError, reportStoreWarning, warnMissingFeature } from "./identity.js";

const baseFeatureContextsByRegistry = new WeakMap<object, Map<string, FeatureHookContext | null>>();
const getBaseFeatureContexts = (registry: object): Map<string, FeatureHookContext | null> => {
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

export const createBaseFeatureContext = (name: string): FeatureHookContext | null => {
    const registry = getRegistry();
    const baseFeatureContexts = getBaseFeatureContexts(registry);
    const cached = baseFeatureContexts.get(name);
    if (cached) return cached;

    const metaEntry = meta[name];
    if (!metaEntry) {
        warn(`Internal feature context requested for "${name}" after metadata was cleared.`);
        return null;
    }

    const ctx: FeatureHookContext = {
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

const validateFeatureContext = (storeName: string, ctx: FeatureHookContext): void => {
    const config = getConfig();
    if (!config.strictMissingFeatures && !config.assertRuntime) return;
    const missing: string[] = [];
    if (typeof ctx.getMeta !== "function") missing.push("getMeta");
    if (typeof ctx.getStoreValue !== "function") missing.push("getStoreValue");
    if (typeof ctx.getAllStores !== "function") missing.push("getAllStores");
    if (typeof ctx.getInitialState !== "function") missing.push("getInitialState");
    if (typeof ctx.hasStore !== "function") missing.push("hasStore");
    if (typeof ctx.setStoreValue !== "function") missing.push("setStoreValue");
    if (typeof ctx.applyFeatureState !== "function") missing.push("applyFeatureState");
    if (typeof ctx.notify !== "function") missing.push("notify");
    if (typeof ctx.reportStoreError !== "function") missing.push("reportStoreError");
    if (typeof ctx.warn !== "function") missing.push("warn");
    if (typeof ctx.log !== "function") missing.push("log");
    if (typeof ctx.hashState !== "function") missing.push("hashState");
    if (typeof ctx.deepClone !== "function") missing.push("deepClone");
    if (typeof ctx.sanitize !== "function") missing.push("sanitize");
    if (typeof ctx.validate !== "function") missing.push("validate");
    if (typeof ctx.isDev !== "function") missing.push("isDev");
    if (missing.length === 0) return;
    const message =
        `Feature hook context missing fields for "${storeName}": ${missing.join(", ")}.`;
    reportStoreError(storeName, message);
    if (config.assertRuntime) throw new Error(message);
};

export const runFeatureCreateHooks = (name: string, notify: (name: string) => void): void => {
    initializeRegisteredFeatureRuntimes();
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    validateFeatureContext(name, baseContext);
    featureRuntimes.forEach((runtime) => {
        runtime.onStoreCreate?.(baseContext);
    });
};

export const runFeatureWriteHooks = (name: string, action: string, prev: StoreValue, next: StoreValue, notify: (name: string) => void): void => {
    initializeRegisteredFeatureRuntimes();
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    const ctx = Object.assign(Object.create(baseContext), {
        action,
        prev,
        next,
    }) as FeatureWriteContext;
    validateFeatureContext(name, ctx);

    featureRuntimes.forEach((runtime) => {
        runtime.onStoreWrite?.(ctx);
    });
};

export const runFeatureDeleteHooks = (name: string, prev: StoreValue, notify: (name: string) => void): void => {
    initializeRegisteredFeatureRuntimes();
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    baseContext.notify = () => notify(name);
    const ctx = Object.assign(Object.create(baseContext), {
        prev,
    }) as FeatureDeleteContext;
    validateFeatureContext(name, ctx);
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


