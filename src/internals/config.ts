import type { SnapshotMode, MiddlewareCtx, StoreValue } from "../adapters/options.js";

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
    defaultSnapshotMode?: SnapshotMode;
    middleware?: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
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
    defaultSnapshotMode: SnapshotMode;
    middleware: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
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
    defaultSnapshotMode: "deep",
    middleware: [],
};

let _config: ResolvedConfig = { ...defaultConfig };

export const getConfig = (): ResolvedConfig => _config;

export const configureStroid = (next?: StroidConfig): void => {
    if (!next) return;

    if (next.logSink) {
        _config = {
            ..._config,
            logSink: {
                log: next.logSink.log ?? _config.logSink.log,
                warn: next.logSink.warn ?? _config.logSink.warn,
                critical: next.logSink.critical ?? _config.logSink.critical,
            },
        };
    }

    if (next.flush) {
        _config = {
            ..._config,
            flush: {
                chunkSize: Number.isFinite(next.flush.chunkSize ?? _config.flush.chunkSize)
                    ? (next.flush.chunkSize as number)
                    : _config.flush.chunkSize,
                chunkDelayMs: Number.isFinite(next.flush.chunkDelayMs ?? _config.flush.chunkDelayMs)
                    ? (next.flush.chunkDelayMs as number)
                    : _config.flush.chunkDelayMs,
                priorityStores: Array.isArray(next.flush.priorityStores)
                    ? next.flush.priorityStores
                    : _config.flush.priorityStores,
            },
        };
    }

    if (next.revalidateOnFocus) {
        _config = {
            ..._config,
            revalidateOnFocus: {
                debounceMs: Number.isFinite(next.revalidateOnFocus.debounceMs ?? _config.revalidateOnFocus.debounceMs)
                    ? (next.revalidateOnFocus.debounceMs as number)
                    : _config.revalidateOnFocus.debounceMs,
                maxConcurrent: Number.isFinite(next.revalidateOnFocus.maxConcurrent ?? _config.revalidateOnFocus.maxConcurrent)
                    ? Math.max(1, next.revalidateOnFocus.maxConcurrent as number)
                    : _config.revalidateOnFocus.maxConcurrent,
                staggerMs: Number.isFinite(next.revalidateOnFocus.staggerMs ?? _config.revalidateOnFocus.staggerMs)
                    ? Math.max(0, next.revalidateOnFocus.staggerMs as number)
                    : _config.revalidateOnFocus.staggerMs,
            },
        };
    }

    if (typeof next.namespace === "string") {
        _config = {
            ..._config,
            namespace: next.namespace.trim(),
        };
    }

    if (typeof next.strictMissingFeatures === "boolean") {
        _config = {
            ..._config,
            strictMissingFeatures: next.strictMissingFeatures,
        };
    }
    if (typeof next.strictFeatures === "boolean") {
        _config = {
            ..._config,
            strictMissingFeatures: next.strictFeatures,
        };
    }

    if (typeof next.assertRuntime === "boolean") {
        _config = {
            ..._config,
            assertRuntime: next.assertRuntime,
        };
    }

    if (typeof next.strictMutatorReturns === "boolean") {
        _config = {
            ..._config,
            strictMutatorReturns: next.strictMutatorReturns,
        };
    }

    if (typeof next.asyncAutoCreate === "boolean") {
        _config = {
            ..._config,
            asyncAutoCreate: next.asyncAutoCreate,
        };
    }

    if (next.asyncCloneResult === "none" || next.asyncCloneResult === "shallow" || next.asyncCloneResult === "deep") {
        _config = {
            ..._config,
            asyncCloneResult: next.asyncCloneResult,
        };
    }

    if (next.defaultSnapshotMode === "shallow" || next.defaultSnapshotMode === "ref" || next.defaultSnapshotMode === "deep") {
        _config = {
            ..._config,
            defaultSnapshotMode: next.defaultSnapshotMode,
        };
    }

    if (Array.isArray(next.middleware)) {
        _config = {
            ..._config,
            middleware: next.middleware,
        };
    }
};

export const resetConfig = (): void => {
    _config = { ...defaultConfig };
};

// Back-compat for tests
export const _resetConfigForTests = (): void => resetConfig();

export const getNamespace = (): string => _config.namespace;
export const setNamespace = (ns: string): void => {
    _config = { ..._config, namespace: ns.trim() };
};
