/**
 * @module internals/config
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/config.
 *
 * Consumers: Internal imports and public API.
 */
import type { SnapshotMode, MiddlewareCtx, StoreValue } from "../adapters/options.js";
import { registerTestResetHook } from "./test-reset.js";
import { warnAlways } from "./diagnostics.js";
import { getActiveStoreRegistry, getDefaultStoreRegistry, type StoreRegistry } from "../store-registry.js";

export type LogSink = {
    log?: (msg: string, meta?: Record<string, unknown>) => void;
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
    critical?: (msg: string, meta?: Record<string, unknown>) => void;
};

export type AsyncCloneMode = "none" | "shallow" | "deep";

export type FlushConfig = {
    chunkSize?: number;
    chunkDelayMs?: number;
    priorityStores?: string[];
};

export type RevalidateOnFocusConfig = {
    debounceMs?: number;
    maxConcurrent?: number;
    staggerMs?: number;
};

export type StroidConfig = {
    logSink?: LogSink;
    flush?: FlushConfig;
    revalidateOnFocus?: RevalidateOnFocusConfig;
    namespace?: string;
    strictMissingFeatures?: boolean;
    strictFeatures?: boolean;
    assertRuntime?: boolean;
    strictMutatorReturns?: boolean;
    asyncAutoCreate?: boolean;
    asyncCloneResult?: AsyncCloneMode;
    /**
     * Acknowledge loose store name typing and suppress dev warnings.
     * Useful when you intentionally skip StoreStateMap augmentation.
     */
    acknowledgeLooseTypes?: boolean;
    /**
     * Max number of cached path validation verdicts per store.
     * Default: 500.
     */
    pathCacheSize?: number;
    defaultSnapshotMode?: SnapshotMode;
    /**
     * Alias for defaultSnapshotMode.
     */
    snapshotStrategy?: SnapshotMode;
    /**
     * Throw on async usage errors instead of returning null.
     * Default: false (usage errors return null and call onError).
     */
    strictAsyncUsageErrors?: boolean;
    middleware?: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    /**
     * Allow hydrateStores to accept trusted snapshots without explicit opt-in.
     * Default: false (hydration requires an explicit trust opt-in).
     */
    allowTrustedHydration?: boolean;
    /**
     * @deprecated Use allowTrustedHydration instead.
     */
    allowUntrustedHydration?: boolean;
    /**
     * Alias for allowTrustedHydration.
     */
    allowHydration?: boolean;
    /**
     * Optional custom mutator engine (e.g. Immer's produce) to enable structural sharing.
     * You can pass the produce function directly or use "immer" after calling registerMutatorProduce().
     */
    mutatorProduce?: (<T>(base: T, recipe: (draft: T) => void) => T) | "immer";
};

type ResolvedConfig = {
    logSink: LogSink;
    flush: Required<FlushConfig>;
    revalidateOnFocus: Required<RevalidateOnFocusConfig>;
    namespace: string;
    strictMissingFeatures: boolean;
    assertRuntime: boolean;
    strictMutatorReturns: boolean;
    asyncAutoCreate: boolean;
    asyncCloneResult: AsyncCloneMode;
    acknowledgeLooseTypes: boolean;
    pathCacheSize: number;
    defaultSnapshotMode: SnapshotMode;
    strictAsyncUsageErrors: boolean;
    middleware: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    allowUntrustedHydration: boolean;
    mutatorProduce?: <T>(base: T, recipe: (draft: T) => void) => T;
};

const defaultLogSink: LogSink = {
    log: (msg: string, meta?: Record<string, unknown>) => {
        if (typeof console !== "undefined" && typeof console.log === "function") {
            if (meta) console.log(`[stroid] ${msg}`, meta);
            else console.log(`[stroid] ${msg}`);
        }
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
            if (meta) console.warn(`[stroid] ${msg}`, meta);
            else console.warn(`[stroid] ${msg}`);
        }
    },
    critical: (msg: string, meta?: Record<string, unknown>) => {
        if (typeof console !== "undefined" && typeof console.error === "function") {
            if (meta) console.error(`[stroid] ${msg}`, meta);
            else console.error(`[stroid] ${msg}`);
        }
    },
};

const defaultConfig: ResolvedConfig = {
    logSink: defaultLogSink,
    flush: {
        chunkSize: Number.POSITIVE_INFINITY,
        chunkDelayMs: 0,
        priorityStores: [],
    },
    revalidateOnFocus: {
        debounceMs: 0,
        maxConcurrent: 3,
        staggerMs: 100,
    },
    namespace: "",
    strictMissingFeatures: true,
    assertRuntime: false,
    strictMutatorReturns: true,
    asyncAutoCreate: false,
    asyncCloneResult: "none",
    acknowledgeLooseTypes: false,
    pathCacheSize: 500,
    defaultSnapshotMode: "shallow",
    strictAsyncUsageErrors: false,
    middleware: [],
    allowUntrustedHydration: false,
    mutatorProduce: undefined,
};

const cloneConfig = (base: ResolvedConfig): ResolvedConfig => ({
    logSink: { ...base.logSink },
    flush: { ...base.flush },
    revalidateOnFocus: { ...base.revalidateOnFocus },
    namespace: base.namespace,
    strictMissingFeatures: base.strictMissingFeatures,
    assertRuntime: base.assertRuntime,
    strictMutatorReturns: base.strictMutatorReturns,
    asyncAutoCreate: base.asyncAutoCreate,
    asyncCloneResult: base.asyncCloneResult,
    acknowledgeLooseTypes: base.acknowledgeLooseTypes,
    pathCacheSize: base.pathCacheSize,
    defaultSnapshotMode: base.defaultSnapshotMode,
    strictAsyncUsageErrors: base.strictAsyncUsageErrors,
    middleware: [...base.middleware],
    allowUntrustedHydration: base.allowUntrustedHydration,
    mutatorProduce: base.mutatorProduce,
});

let configByRegistry = new WeakMap<StoreRegistry, ResolvedConfig>();
let baseConfig = cloneConfig(defaultConfig);
const getRegistryConfig = (registry: StoreRegistry): ResolvedConfig => {
    let config = configByRegistry.get(registry);
    if (!config) {
        config = cloneConfig(baseConfig);
        configByRegistry.set(registry, config);
    }
    return config;
};

let registeredMutatorProduce: (<T>(base: T, recipe: (draft: T) => void) => T) | undefined;
let mutatorProduceLocked = false;
let immerMissingWarned = false;
const resolveImmerProduce = (): (<T>(base: T, recipe: (draft: T) => void) => T) | undefined =>
    registeredMutatorProduce;

export const getConfig = (): ResolvedConfig => getRegistryConfig(getActiveStoreRegistry());

export const registerMutatorProduce = (
    produce: (<T>(base: T, recipe: (draft: T) => void) => T),
    options: { force?: boolean } = {}
): void => {
    if (typeof produce !== "function") {
        throw new Error("registerMutatorProduce requires a function.");
    }
    if (mutatorProduceLocked && !options.force) {
        warnAlways(
            "registerMutatorProduce() called after lock. " +
            "Pass { force: true } only if you intentionally replace the producer."
        );
        return;
    }
    registeredMutatorProduce = produce;
    mutatorProduceLocked = true;
    configureStroid({ mutatorProduce: produce });
};

export const configureStroid = (next?: StroidConfig): void => {
    if (!next) return;
    const registry = getActiveStoreRegistry();
    let config = getRegistryConfig(registry);

    if (next.logSink) {
        config = {
            ...config,
            logSink: {
                log: next.logSink.log ?? config.logSink.log,
                warn: next.logSink.warn ?? config.logSink.warn,
                critical: next.logSink.critical ?? config.logSink.critical,
            },
        };
    }

    if (next.flush) {
        config = {
            ...config,
            flush: {
                chunkSize: Number.isFinite(next.flush.chunkSize ?? config.flush.chunkSize)
                    ? (next.flush.chunkSize as number)
                    : config.flush.chunkSize,
                chunkDelayMs: Number.isFinite(next.flush.chunkDelayMs ?? config.flush.chunkDelayMs)
                    ? (next.flush.chunkDelayMs as number)
                    : config.flush.chunkDelayMs,
                priorityStores: Array.isArray(next.flush.priorityStores)
                    ? next.flush.priorityStores
                    : config.flush.priorityStores,
            },
        };
    }

    if (next.revalidateOnFocus) {
        config = {
            ...config,
            revalidateOnFocus: {
                debounceMs: Number.isFinite(next.revalidateOnFocus.debounceMs ?? config.revalidateOnFocus.debounceMs)
                    ? (next.revalidateOnFocus.debounceMs as number)
                    : config.revalidateOnFocus.debounceMs,
                maxConcurrent: Number.isFinite(next.revalidateOnFocus.maxConcurrent ?? config.revalidateOnFocus.maxConcurrent)
                    ? Math.max(1, next.revalidateOnFocus.maxConcurrent as number)
                    : config.revalidateOnFocus.maxConcurrent,
                staggerMs: Number.isFinite(next.revalidateOnFocus.staggerMs ?? config.revalidateOnFocus.staggerMs)
                    ? Math.max(0, next.revalidateOnFocus.staggerMs as number)
                    : config.revalidateOnFocus.staggerMs,
            },
        };
    }

    if (typeof next.namespace === "string") {
        config = {
            ...config,
            namespace: next.namespace.trim(),
        };
    }

    if (typeof next.strictMissingFeatures === "boolean") {
        config = {
            ...config,
            strictMissingFeatures: next.strictMissingFeatures,
        };
    }
    if (typeof next.strictFeatures === "boolean") {
        config = {
            ...config,
            strictMissingFeatures: next.strictFeatures,
        };
    }

    if (typeof next.assertRuntime === "boolean") {
        config = {
            ...config,
            assertRuntime: next.assertRuntime,
        };
    }

    if (typeof next.strictMutatorReturns === "boolean") {
        config = {
            ...config,
            strictMutatorReturns: next.strictMutatorReturns,
        };
    }

    if (typeof next.asyncAutoCreate === "boolean") {
        config = {
            ...config,
            asyncAutoCreate: next.asyncAutoCreate,
        };
    }
    if (typeof next.strictAsyncUsageErrors === "boolean") {
        config = {
            ...config,
            strictAsyncUsageErrors: next.strictAsyncUsageErrors,
        };
    }

    if (next.asyncCloneResult === "none" || next.asyncCloneResult === "shallow" || next.asyncCloneResult === "deep") {
        config = {
            ...config,
            asyncCloneResult: next.asyncCloneResult,
        };
    }
    if (typeof next.acknowledgeLooseTypes === "boolean") {
        config = {
            ...config,
            acknowledgeLooseTypes: next.acknowledgeLooseTypes,
        };
    }
    if (typeof next.pathCacheSize === "number" && Number.isFinite(next.pathCacheSize)) {
        config = {
            ...config,
            pathCacheSize: Math.max(0, Math.floor(next.pathCacheSize)),
        };
    }

    if (next.snapshotStrategy === "shallow" || next.snapshotStrategy === "ref" || next.snapshotStrategy === "deep") {
        config = {
            ...config,
            defaultSnapshotMode: next.snapshotStrategy,
        };
    }

    if (next.defaultSnapshotMode === "shallow" || next.defaultSnapshotMode === "ref" || next.defaultSnapshotMode === "deep") {
        config = {
            ...config,
            defaultSnapshotMode: next.defaultSnapshotMode,
        };
    }

    if (Array.isArray(next.middleware)) {
        config = {
            ...config,
            middleware: next.middleware,
        };
    }

    if (typeof next.allowUntrustedHydration === "boolean") {
        config = {
            ...config,
            allowUntrustedHydration: next.allowUntrustedHydration,
        };
    }
    if (typeof next.allowHydration === "boolean") {
        config = {
            ...config,
            allowUntrustedHydration: next.allowHydration,
        };
    }
    if (typeof next.allowTrustedHydration === "boolean") {
        config = {
            ...config,
            allowUntrustedHydration: next.allowTrustedHydration,
        };
    }

    if (typeof next.mutatorProduce === "function") {
        config = {
            ...config,
            mutatorProduce: next.mutatorProduce,
        };
    } else if (next.mutatorProduce === "immer") {
        const produce = resolveImmerProduce();
        if (produce) {
            config = {
                ...config,
                mutatorProduce: produce,
            };
        } else {
            if (!immerMissingWarned) {
                immerMissingWarned = true;
                warnAlways(
                    `configureStroid({ mutatorProduce: "immer" }) requires Immer's produce function.\n` +
                    `Call registerMutatorProduce(produce) or pass mutatorProduce: produce directly.`
                );
            }
        }
    }

    configByRegistry.set(registry, config);
    if (registry === getDefaultStoreRegistry()) {
        baseConfig = cloneConfig(config);
    }
};

export const resetConfig = (): void => {
    configByRegistry = new WeakMap<StoreRegistry, ResolvedConfig>();
    baseConfig = cloneConfig(defaultConfig);
    registeredMutatorProduce = undefined;
    mutatorProduceLocked = false;
    immerMissingWarned = false;
};

registerTestResetHook("config.reset", resetConfig, 90);

// Back-compat for tests
export const _resetConfigForTests = (): void => resetConfig();

export const getNamespace = (): string => getConfig().namespace;
export const setNamespace = (ns: string): void => {
    const registry = getActiveStoreRegistry();
    const config = getRegistryConfig(registry);
    const next = { ...config, namespace: ns.trim() };
    configByRegistry.set(registry, next);
    if (registry === getDefaultStoreRegistry()) {
        baseConfig = cloneConfig(next);
    }
};


