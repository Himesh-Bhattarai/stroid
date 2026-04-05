/**
 * @module store-lifecycle/hooks
 *
 * LAYER: Store lifecycle
 * OWNS:  Module-level behavior and exports for store-lifecycle/hooks.
 *
 * Consumers: Internal imports and public API.
 */
import { warn, warnAlways, log, hashState, deepClone, sanitize, isDev } from "../../utils.js";
import { runMiddleware, runStoreHook, MIDDLEWARE_ABORT } from "../../features/lifecycle.js";
import { getConfig } from "../../internals/config.js";
import { registerTestResetHook } from "../../internals/test-reset.js";
import {
    hasRegisteredStoreFeature,
    getRegisteredFeatureNames,
    type FeatureDeleteContext,
    type FeatureHookContext,
    type FeatureName,
    type FeatureWriteContext,
    type StoreFeatureMeta,
    type StoreFeatureRuntime,
} from "../../features/feature-registry.js";
import type { NormalizedOptions } from "../../adapters/options.js";
import type { StoreValue } from "./types.js";
import {
    meta,
    stores,
    initialStates,
    featureRuntimes,
    applyFeatureState,
    getCommittedStoreValueRef,
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

export const dropFeatureContextForStore = (name: string, registry = getRegistry()): void => {
    getBaseFeatureContexts(registry).delete(name);
};

export const _getFeatureContextCountForTests = (registry = getRegistry()): number =>
    getBaseFeatureContexts(registry).size;

const shouldRunFeatureForStore = (
    featureName: FeatureName,
    options: NormalizedOptions | undefined
): boolean => {
    if (!options) {
        return featureName !== "persist" && featureName !== "sync";
    }
    if (featureName === "persist") return !!options.persist;
    if (featureName === "sync") return !!options.sync;
    if (featureName === "devtools") return true;
    return true;
};

type StoreNotifyFn = (name: string) => void;
type NotifyBinding = {
    notifyFn: StoreNotifyFn;
    bound: () => void;
};

const notifyBindings = new WeakMap<FeatureHookContext, NotifyBinding>();

const bindNotify = (
    baseContext: FeatureHookContext,
    name: string,
    notify: StoreNotifyFn
): void => {
    const existing = notifyBindings.get(baseContext);
    if (existing && existing.notifyFn === notify) {
        baseContext.notify = existing.bound;
        return;
    }
    const bound = () => notify(name);
    notifyBindings.set(baseContext, { notifyFn: notify, bound });
    baseContext.notify = bound;
};

export const createBaseFeatureContext = (name: string): FeatureHookContext | null => {
    const registry = getRegistry();
    const baseFeatureContexts = getBaseFeatureContexts(registry);

    const metaEntry = meta[name];
    if (!metaEntry) {
        warn(`Internal feature context requested for "${name}" after metadata was cleared.`);
        return null;
    }
    const cached = baseFeatureContexts.get(name);
    if (cached && cached.options === metaEntry.options) return cached;
    if (cached) {
        baseFeatureContexts.delete(name);
    }

    const getAllCommittedStores = (): Record<string, StoreValue> =>
        Object.fromEntries(
            Object.keys(registry.metaEntries).map((storeName) => [
                storeName,
                getCommittedStoreValueRef(storeName, registry) as StoreValue,
            ])
        ) as Record<string, StoreValue>;

    const ctx: FeatureHookContext = {
        name,
        options: metaEntry.options,
        getMeta: () => meta[name],
        getStoreValue: () => getCommittedStoreValueRef(name, registry) as StoreValue,
        getAllStores: getAllCommittedStores,
        getInitialState: () => initialStates[name],
        hasStore: () => hasStoreEntryInternal(name),
        setStoreValue: (value: StoreValue) => {
            setStoreValueInternal(name, value);
        },
        applyFeatureState: (value: StoreValue, updatedAtMs?: number, options?) => {
            const next = applyFeatureState(name, value, updatedAtMs, options);
            invalidatePathCache(name);
            return next;
        },
        notify: () => {
            // noop placeholder to be bound by store-notify
        },
        reportStoreError: (message: string) => {
            reportStoreError(name, message);
        },
        warn,
        warnAlways,
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
    if (typeof ctx.warnAlways !== "function") missing.push("warnAlways");
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

const hasRegisteredFeatureFactories = (): boolean =>
    getRegisteredFeatureNames().length > 0;

const hasApplicableFeatureHook = (
    name: string,
    hook: "onStoreCreate" | "onStoreWrite" | "beforeStoreDelete" | "afterStoreDelete",
    excluded?: ReadonlySet<FeatureName>
): boolean => {
    const options = meta[name]?.options;
    if (!options) return false;
    const runtimes = featureRuntimes as Map<FeatureName, StoreFeatureRuntime>;
    for (const [featureName, runtime] of runtimes) {
        if (excluded?.has(featureName)) continue;
        if (!shouldRunFeatureForStore(featureName, options)) continue;
        if (hook === "onStoreCreate" && runtime.onStoreCreate) return true;
        if (hook === "onStoreWrite" && runtime.onStoreWrite) return true;
        if (hook === "beforeStoreDelete" && runtime.beforeStoreDelete) return true;
        if (hook === "afterStoreDelete" && runtime.afterStoreDelete) return true;
    }
    return false;
};

export const runFeatureCreateHooks = (name: string, notify: (name: string) => void): void => {
    if (!hasRegisteredFeatureFactories()) return;
    initializeRegisteredFeatureRuntimes();
    if (!hasApplicableFeatureHook(name, "onStoreCreate")) return;
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    bindNotify(baseContext, name, notify);
    validateFeatureContext(name, baseContext);
    (featureRuntimes as Map<FeatureName, StoreFeatureRuntime>).forEach((runtime, featureName) => {
        if (!shouldRunFeatureForStore(featureName, baseContext.options)) return;
        try {
            runtime.onStoreCreate?.(baseContext);
        } catch (err) {
            reportStoreWarning(
                name,
                `Feature "${String(featureName)}" onStoreCreate for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                "always"
            );
        }
    });
};

export const runFeatureWriteHooks = (name: string, action: string, prev: StoreValue, next: StoreValue, notify: (name: string) => void): void => {
    if (!hasRegisteredFeatureFactories()) return;
    initializeRegisteredFeatureRuntimes();
    if (!hasApplicableFeatureHook(name, "onStoreWrite")) return;
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    let ctx: FeatureWriteContext | null = null;
    (featureRuntimes as Map<FeatureName, StoreFeatureRuntime>).forEach((runtime, featureName) => {
        const hook = runtime.onStoreWrite;
        if (!hook) return;
        if (!shouldRunFeatureForStore(featureName, baseContext.options)) return;
        if (!ctx) {
            bindNotify(baseContext, name, notify);
            ctx = Object.create(baseContext) as FeatureWriteContext;
            ctx.action = action;
            ctx.prev = prev;
            ctx.next = next;
            validateFeatureContext(name, ctx);
        }
        try {
            hook(ctx);
        } catch (err) {
            reportStoreWarning(
                name,
                `Feature "${String(featureName)}" onStoreWrite for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                "always"
            );
        }
    });
};

export const runFeatureWriteHooksExcept = (
    name: string,
    action: string,
    prev: StoreValue,
    next: StoreValue,
    notify: (name: string) => void,
    excluded: FeatureName[]
): void => {
    if (!hasRegisteredFeatureFactories()) return;
    initializeRegisteredFeatureRuntimes();
    const excludedSet = new Set(excluded);
    if (!hasApplicableFeatureHook(name, "onStoreWrite", excludedSet)) return;
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    let ctx: FeatureWriteContext | null = null;

    (featureRuntimes as Map<FeatureName, StoreFeatureRuntime>).forEach((runtime, featureName) => {
        const hook = runtime.onStoreWrite;
        if (!hook) return;
        if (excludedSet.has(featureName)) return;
        if (!shouldRunFeatureForStore(featureName, baseContext.options)) return;
        if (!ctx) {
            bindNotify(baseContext, name, notify);
            ctx = Object.create(baseContext) as FeatureWriteContext;
            ctx.action = action;
            ctx.prev = prev;
            ctx.next = next;
            validateFeatureContext(name, ctx);
        }
        try {
            hook(ctx);
        } catch (err) {
            reportStoreWarning(
                name,
                `Feature "${String(featureName)}" onStoreWrite for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                "always"
            );
        }
    });
};

export const runFeatureDeleteHooks = (name: string, prev: StoreValue, notify: (name: string) => void): void => {
    if (!hasRegisteredFeatureFactories()) {
        dropFeatureContextForStore(name);
        return;
    }
    initializeRegisteredFeatureRuntimes();
    const hasBefore = hasApplicableFeatureHook(name, "beforeStoreDelete");
    const hasAfter = hasApplicableFeatureHook(name, "afterStoreDelete");
    if (!hasBefore && !hasAfter) {
        dropFeatureContextForStore(name);
        return;
    }
    const baseContext = createBaseFeatureContext(name);
    if (!baseContext) return;
    let ctx: FeatureDeleteContext | null = null;
    const resolveDeleteContext = (): FeatureDeleteContext => {
        if (ctx) return ctx;
        bindNotify(baseContext, name, notify);
        ctx = Object.create(baseContext) as FeatureDeleteContext;
        ctx.prev = prev;
        validateFeatureContext(name, ctx);
        return ctx;
    };
    (featureRuntimes as Map<FeatureName, StoreFeatureRuntime>).forEach((runtime, featureName) => {
        const hook = runtime.beforeStoreDelete;
        if (!hook) return;
        if (!shouldRunFeatureForStore(featureName, baseContext.options)) return;
        try {
            hook(resolveDeleteContext());
        } catch (err) {
            reportStoreWarning(
                name,
                `Feature "${String(featureName)}" beforeStoreDelete for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                "always"
            );
        }
    });
    (featureRuntimes as Map<FeatureName, StoreFeatureRuntime>).forEach((runtime, featureName) => {
        const hook = runtime.afterStoreDelete;
        if (!hook) return;
        if (!shouldRunFeatureForStore(featureName, baseContext.options)) return;
        try {
            hook(resolveDeleteContext());
        } catch (err) {
            reportStoreWarning(
                name,
                `Feature "${String(featureName)}" afterStoreDelete for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                "always"
            );
        }
    });
    dropFeatureContextForStore(name);
};

export const runMiddlewareForStore = (
    name: string,
    payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown; correlationId?: string; traceContext?: import("../../types/utility.js").TraceContext; }
): StoreValue | typeof MIDDLEWARE_ABORT => {
    const storeMiddleware = meta[name]?.options?.middleware;
    const globalMiddleware = getConfig().middleware;
    const hasStoreMiddleware = !!storeMiddleware && storeMiddleware.length > 0;
    const hasGlobalMiddleware = !!globalMiddleware && globalMiddleware.length > 0;

    if (!hasStoreMiddleware && !hasGlobalMiddleware) {
        return payload.next;
    }

    const middlewares = hasStoreMiddleware
        ? (hasGlobalMiddleware
            // Store-level first, then global middleware as the final gate.
            ? [...storeMiddleware, ...globalMiddleware]
            : storeMiddleware)
        : globalMiddleware;

    return runMiddleware({
        name,
        payload,
        middlewares,
        reportIssue: (message, visibility) => {
            reportStoreWarning(name, message, visibility);
        },
        warn,
    });
};

export const runStoreHookSafe = (
    name: string,
    label: "onCreate" | "onSet" | "onReset" | "onDelete",
    fn: ((...args: unknown[]) => void) | undefined,
    args: unknown[]
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
