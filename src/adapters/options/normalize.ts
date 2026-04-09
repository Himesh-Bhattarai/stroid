/**
 * @module adapters/options/normalize
 *
 * LAYER: Module
 * OWNS:  Store option normalization and default materialization.
 */
import { hasOwn, isIdentityStringTransform, isObject } from "./helpers.js";
import { normalizePersistOptions } from "./persist.js";
import type {
    DevtoolsOptions,
    LifecycleOptions,
    NormalizedOptions,
    PersistOptions,
    ResetCloneMode,
    SnapshotMode,
    StoreOptions,
    StoreScope,
} from "./types.js";

/**
 * Normalize a store options object, merging default values and performing deprecation checks.
 * @param option The store options object to normalize.
 * @param name The name of the store.
 * @param defaultSnapshotMode The default snapshot mode to use if none is specified.
 * @returns A normalized store options object.
 */
export const normalizeStoreOptions = <State>(
    option: StoreOptions<State> = {},
    name: string,
    defaultSnapshotMode: SnapshotMode = "deep",
    defaultResetCloneMode: ResetCloneMode = "deep"
): NormalizedOptions => {
    const normalizedScope: StoreScope = option.scope ?? "request";
    const normalizedLazy = option.lazy === true;
    const normalizedPathCreate = option.pathCreate === true;
    const lifecycle = isObject(option.lifecycle) ? option.lifecycle as LifecycleOptions<State> : undefined;
    const persistGroup = isObject(option.persist) ? option.persist as PersistOptions<State> : undefined;
    const devtoolsGroup = isObject(option.devtools) ? option.devtools as DevtoolsOptions<State> : undefined;
    const normalizedValidate = option.validate ?? option.validator ?? option.schema;
    const normalizedSnapshot =
        option.snapshot === "shallow" || option.snapshot === "ref" || option.snapshot === "deep"
            ? option.snapshot
            : (defaultSnapshotMode === "shallow" || defaultSnapshotMode === "ref" || defaultSnapshotMode === "deep"
                ? defaultSnapshotMode
                : "deep");
    const normalizedSnapshotSafety =
        option.snapshotSafety === "warn" || option.snapshotSafety === "throw" || option.snapshotSafety === "auto-clone"
            ? option.snapshotSafety
            : undefined;
    const normalizedResetClone =
        option.resetClone === "none" || option.resetClone === "shallow" || option.resetClone === "deep"
            ? option.resetClone
            : defaultResetCloneMode;
    const normalizedFeatures = isObject(option.features)
        ? { ...(option.features as Record<string, unknown>) }
        : undefined;
    const explicitPersist = hasOwn(option, "persist");
    const explicitSync = hasOwn(option, "sync");
    const explicitDevtools = hasOwn(option, "devtools") || hasOwn(option, "historyLimit") || hasOwn(option, "redactor");
    const normalizedAllowSSRGlobalStore = normalizedScope === "global"
        ? true
        : (option.allowSSRGlobalStore ?? false);

    const {
        persist = false,
        devtools = false,
        onError,
        sync,
    } = option;

    if (persistGroup?.sensitiveData === true) {
        const enc = persistGroup.encrypt;
        const encAsync = persistGroup.encryptAsync;
        const isIdentity = !enc || isIdentityStringTransform(enc);
        if (isIdentity && !encAsync) {
            throw new Error(
                `[stroid/persist] Store "${name}" is marked sensitiveData but is configured to persist in plaintext. ` +
                `Provide encrypt/decrypt hooks to protect sensitive data.`,
            );
        }
    }

    return {
        scope: normalizedScope,
        lazy: normalizedLazy,
        pathCreate: normalizedPathCreate,
        persist: normalizedScope === "temp" && !explicitPersist
            ? null
            : normalizePersistOptions<State>(persist, name),
        devtools: normalizedScope === "temp" && !explicitDevtools
            ? false
            : (typeof devtools === "boolean" ? devtools : (devtoolsGroup?.enabled ?? true)),
        middleware: (lifecycle?.middleware ?? option.middleware ?? []) as NormalizedOptions["middleware"],
        onSet: (lifecycle?.onSet ?? option.onSet) as NormalizedOptions["onSet"],
        onReset: (lifecycle?.onReset ?? option.onReset) as NormalizedOptions["onReset"],
        onDelete: (lifecycle?.onDelete ?? option.onDelete) as NormalizedOptions["onDelete"],
        onCreate: (lifecycle?.onCreate ?? option.onCreate) as NormalizedOptions["onCreate"],
        onError,
        validate: normalizedValidate as NormalizedOptions["validate"],
        migrations: (persistGroup?.migrations ?? option.migrations ?? {}) as NormalizedOptions["migrations"],
        version: persistGroup?.version ?? option.version ?? 1,
        redactor: normalizedScope === "temp" && !explicitDevtools
            ? undefined
            : (devtoolsGroup?.redactor ?? option.redactor) as NormalizedOptions["redactor"],
        historyLimit: normalizedScope === "temp" && !explicitDevtools
            ? 0
            : (devtoolsGroup?.historyLimit ?? option.historyLimit ?? 50),
        sync: normalizedScope === "temp" && !explicitSync
            ? false
            : (sync ?? false),
        features: normalizedFeatures,
        allowSSRGlobalStore: normalizedAllowSSRGlobalStore,
        snapshot: normalizedSnapshot,
        resetClone: normalizedResetClone,
        snapshotSafety: normalizedSnapshotSafety,
        explicitPersist,
        explicitSync,
        explicitDevtools,
    };
};
