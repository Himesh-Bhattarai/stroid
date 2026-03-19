/**
 * @module adapters/options
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for adapters/options.
 *
 * Consumers: Internal imports and public API.
 */
import { registerTestResetHook } from "../internals/test-reset.js";
import type { TraceContext } from "../types/utility.js";

export type StoreValue = unknown;

// Ambient map users can augment to type feature option bags.
// Example:
//   declare module "stroid" { interface FeatureOptionsMap { myFeature: { enabled: boolean } } }
export interface FeatureOptionsMap {}
export type FeatureOptions = Partial<FeatureOptionsMap> & Record<string, unknown>;

export interface PersistDriver {
    getItem?: (k: string) => string | null | Promise<string | null>;
    setItem?: (k: string, v: string) => void | Promise<void>;
    removeItem?: (k: string) => void | Promise<void>;
    [key: string]: unknown;
}

export type StoreScope = "request" | "global" | "temp";
export type SnapshotMode = "deep" | "shallow" | "ref";

export type ValidateFn<State = StoreValue> = (next: State) => boolean | State;

export type SchemaValidateOption =
    | { safeParse: (value: unknown) => { success: true; data: unknown } | { success: false; error?: unknown } }
    | { parse: (value: unknown) => unknown }
    | { validateSync: (value: unknown) => unknown }
    | { isValidSync: (value: unknown) => boolean }
    | { validate: (value: unknown) => unknown };

export type ValidateOption<State = StoreValue> = ValidateFn<State> | SchemaValidateOption;

export interface PersistOptions<State = StoreValue> {
    driver?: PersistDriver;
    storage?: PersistDriver;
    key?: string;
    serialize?: (v: unknown) => string;
    deserialize?: (v: string) => unknown;
    /**
     * Optional encryption hook for persisted payloads.
     *
     * Default is identity (no encryption). Data is stored in plaintext.
     */
    encrypt?: (v: string) => string;
    /**
     * Optional async encryption hook for persisted payloads.
     *
     * When provided, persistence will encrypt in the background and hydrate asynchronously.
     */
    encryptAsync?: (v: string) => Promise<string>;
    /**
     * Optional decryption hook for persisted payloads.
     *
     * Default is identity (no encryption). Data is stored in plaintext.
     */
    decrypt?: (v: string) => string;
    /**
     * Optional async decryption hook for persisted payloads.
     *
     * When provided, persistence will hydrate asynchronously after store creation.
     */
    decryptAsync?: (v: string) => Promise<string>;
    /**
     * Explicitly allow plaintext persistence when encrypt/decrypt are identity.
     *
     * In production builds, plaintext persistence is blocked unless this is true.
     */
    allowPlaintext?: boolean;
    /**
     * Marks this store's persisted data as sensitive (secrets/PII).
     *
     * When `true`, stroid throws at store creation time unless a non-identity
     * `encrypt` hook is provided.
     */
    sensitiveData?: boolean;
    /**
     * Maximum allowed persisted payload size (in characters).
     * When exceeded, hydration is skipped and an error is reported.
     */
    maxSize?: number;
    /**
     * Integrity check mode for persisted payloads.
     * - "hash" (default): store and validate a checksum.
     * - "none": skip checksum generation/validation.
     * - "sha256": store a SHA-256 hash for stronger tamper detection (may be async in browsers).
     */
    checksum?: "hash" | "none" | "sha256";
    version?: number;
    migrations?: Record<number, (state: State) => State>;
    onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown);
    onStorageCleared?: (info: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => void;
}

export interface PersistConfig {
    driver: PersistDriver;
    key: string;
    serialize: (v: unknown) => string;
    deserialize: (v: string) => unknown;
    encrypt: (v: string) => string;
    decrypt: (v: string) => string;
    encryptAsync?: (v: string) => Promise<string>;
    decryptAsync?: (v: string) => Promise<string>;
    allowPlaintext?: boolean;
    sensitiveData?: boolean;
    maxSize?: number;
    checksum: "hash" | "none" | "sha256";
    onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown);
    onStorageCleared?: (info: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => void;
}

export interface MiddlewareCtx {
    action: string;
    name: string;
    prev: StoreValue;
    next: StoreValue;
    path: unknown;
    correlationId?: string;
    traceContext?: TraceContext;
}

export interface SyncOptions {
    channel?: string;
    maxPayloadBytes?: number;
    /**
     * Authentication policy for sync.
     * - "strict": require authToken or verify (blocks sync if missing)
     * - "insecure": allow unauthenticated sync (explicit opt-out)
     */
    policy?: "strict" | "insecure";
    /**
     * Optional shared token for lightweight cross-tab authentication.
     * When set, incoming sync messages without a matching token are rejected.
     */
    authToken?: string;
    /**
     * Explicitly allow unauthenticated sync.
     * Deprecated in favor of policy: "insecure".
     */
    insecure?: boolean;
    conflictResolver?: (args: {
        local: StoreValue;
        incoming: StoreValue;
        localUpdated: number;
        incomingUpdated: number;
    }) => StoreValue | void;
    /**
     * Optional guard to prevent rapid feedback loops when sync updates trigger local reactions.
     *
     * - true: enable with a default window (100ms)
     * - { windowMs }: customize the guard window in milliseconds
     * - false: disable (default is enabled when sync is truthy)
     */
    loopGuard?: boolean | { windowMs?: number };
    /**
     * Optional checksum mode for sync payloads.
     * - "hash" (default): include a checksum of the payload.
     * - "none": skip checksum generation.
     */
    checksum?: "hash" | "none";
    /**
     * Optional signer for sync payloads. The returned value is attached to the message as `auth`.
     */
    sign?: (payload: SyncMessage) => unknown;
    /**
     * Optional verifier for incoming sync payloads.
     * Return true to accept the message, false to reject it.
     */
    verify?: (payload: SyncMessage) => boolean;
    /**
     * Optional resolver for updatedAt timestamps when conflicts are resolved.
     */
    resolveUpdatedAt?: (args: {
        localUpdated: number;
        incomingUpdated: number | undefined;
        now: number;
    }) => number;
}

export type SyncMessage = {
    v: number;
    protocol: number;
    type: "sync-request" | "sync-state";
    name: string;
    clock: number;
    source: string;
    updatedAt?: number;
    data?: StoreValue;
    checksum?: number | null;
    auth?: unknown;
    token?: string;
    requestedAt?: number;
};

export interface DevtoolsOptions<State = StoreValue> {
    enabled?: boolean;
    historyLimit?: number;
    redactor?: (state: State) => State;
}

export interface LifecycleOptions<State = StoreValue> {
    middleware?: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    onSet?: (prev: State, next: State) => void;
    onReset?: (prev: State, next: State) => void;
    onDelete?: (prev: State) => void;
    onCreate?: (initial: State) => void;
}

export interface StoreOptions<State = StoreValue> {
    scope?: StoreScope;
    lazy?: boolean;
    /**
     * Allow `setStore(name, path, value)` to create missing **leaf** keys on object nodes.
     *
     * Default: `false` (strict path writes).
     *
     * Notes:
     * - Does not expand arrays (out-of-bounds indices are still rejected).
     * - Does not create missing intermediate objects for deep paths; define the shape up-front.
     */
    pathCreate?: boolean;
    validate?: ValidateOption<State>;
    persist?: boolean | string | PersistOptions<State>;
    devtools?: boolean | DevtoolsOptions<State>;
    lifecycle?: LifecycleOptions<State>;
    middleware?: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    onSet?: (prev: State, next: State) => void;
    onReset?: (prev: State, next: State) => void;
    onDelete?: (prev: State) => void;
    onCreate?: (initial: State) => void;
    onError?: (err: string) => void;
    /** @deprecated use validate instead */
    validator?: (next: State) => boolean;
    /** @deprecated use validate instead */
    schema?: unknown;
    migrations?: Record<number, (state: State) => State>;
    version?: number;
    redactor?: (state: State) => State;
    historyLimit?: number;
    allowSSRGlobalStore?: boolean;
    sync?: boolean | SyncOptions;
    /**
     * Optional feature option bag for third-party plugins.
     * Keys are plugin names, values are plugin-specific options.
     */
    features?: FeatureOptions;
    /**
     * Snapshot cloning strategy used by subscriptions and selector snapshots.
     *
     * - "deep" (default): deep clone and dev-freeze snapshot values.
     * - "shallow": shallow clone (top-level) only; nested references are shared.
     * - "ref": return the live store reference (dev-freeze by default).
     */
    snapshot?: SnapshotMode;
    /**
     * Safety policy for snapshot deliveries when using "ref" or "shallow" modes.
     * - "warn": (default) log a warning in dev when mutation is detected.
     * - "throw": throw an error in dev when mutation is detected.
     * - "auto-clone": in dev, if a subscriber mutates a frozen snapshot, deliver a cloned
     *   snapshot to that subscriber so the mutation does not affect other subscribers or the store.
     */
    snapshotSafety?: 'warn' | 'throw' | 'auto-clone';
}

export interface NormalizedOptions {
    scope: StoreScope;
    lazy: boolean;
    pathCreate: boolean;
    persist: PersistConfig | null;
    devtools: boolean;
    middleware: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    onSet?: (prev: StoreValue, next: StoreValue) => void;
    onReset?: (prev: StoreValue, next: StoreValue) => void;
    onDelete?: (prev: StoreValue) => void;
    onCreate?: (initial: StoreValue) => void;
    onError?: (err: string) => void;
    validate?: ValidateOption;
    migrations: Record<number, (state: any) => any>;
    version: number;
    redactor?: (state: StoreValue) => StoreValue;
    historyLimit: number;
    allowSSRGlobalStore?: boolean;
    sync?: boolean | SyncOptions;
    features?: FeatureOptions;
    snapshot: SnapshotMode;
    /** normalized snapshotSafety value */
    snapshotSafety?: 'warn' | 'throw' | 'auto-clone';
    explicitPersist: boolean;
    explicitSync: boolean;
    explicitDevtools: boolean;
}

const warnedLegacyOptions = new Set<string>();

/**
 * Resets the internal set of legacy options that have been warned
 * about. Used for testing purposes to prevent warnings from leaking
 * between tests.
 */
export const resetLegacyOptionDeprecationWarningsForTests = (): void => {
    warnedLegacyOptions.clear();
};

registerTestResetHook("options.legacy-warnings", resetLegacyOptionDeprecationWarningsForTests, 30);

const memoryStorage: PersistDriver = (() => {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); },
        type: "memory",
    };
})();

/**
 * Returns a storage driver that attempts to use the given type of storage
 * (session or local) and falls back to memory storage if it is not available.
 *
 * @param {string} type The type of storage to attempt to use.
 * @returns {PersistDriver} A storage driver that may use memory storage if necessary.
 */
const safeStorage = (type: string): PersistDriver => {
    try {
        if (typeof window === "undefined") return memoryStorage;
        if (type === "session" || type === "sessionStorage") return window.sessionStorage ?? memoryStorage;
        return window.localStorage ?? memoryStorage;
    } catch (_) {
        return memoryStorage;
    }
};

/**
 * Checks if a value is an object.
 *
 * This function checks if the value is of type 'object', is not null, and is not an array.
 *
 * @returns {boolean} True if the value is an object, false otherwise.
 */
const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

const isIdentityStringTransform = (fn: (v: string) => string): boolean => {
    try {
        const probeA = `__stroid_plaintext_probe_${Math.random().toString(36).slice(2)}__`;
        const probeB = `__stroid_plaintext_probe_${Math.random().toString(36).slice(2)}__`;
        if (fn(probeA) !== probeA) return false;
        return fn(probeB) === probeB;
    } catch (_) {
        return false;
    }
};

const DEFAULT_PERSIST_CRYPTO_MARK = typeof Symbol === "function"
    ? Symbol.for("stroid.persist.defaultCrypto")
    : "__stroid_persist_defaultCrypto__";

const markDefaultPersistCrypto = (fn: (v: string) => string): ((v: string) => string) => {
    try {
        (fn as any)[DEFAULT_PERSIST_CRYPTO_MARK] = true;
    } catch (_) {
        // ignore marker failures
    }
    return fn;
};

const legacyOptionReplacementMap: Record<string, string> = {
    allowSSRGlobalStore: `scope: "global"`,
    schema: "validate",
    validator: "validate",
    version: "persist.version",
    migrations: "persist.migrations",
    historyLimit: "devtools.historyLimit",
    redactor: "devtools.redactor",
    middleware: "lifecycle.middleware",
    onCreate: "lifecycle.onCreate",
    onSet: "lifecycle.onSet",
    onReset: "lifecycle.onReset",
    onDelete: "lifecycle.onDelete",
};

/**
 * Normalize persist options for a store.
 *
 * This function takes the raw persist options from a store and returns
 * a normalized PersistConfig object. If the raw persist options are
 * invalid, this function returns null.
 *
 * @template State
 * @param {StoreOptions<State>["persist"]} persist - The raw persist options for the store.
 * @param {string} name - The name of the store.
 * @returns {PersistConfig | null} A normalized PersistConfig object, or null if the raw persist options are invalid.
 */
export const normalizePersistOptions = <State>(
    persist: StoreOptions<State>["persist"],
    name: string
): PersistConfig | null => {
    if (!persist) return null;

    const base = {
        key: `stroid_${name}`,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: markDefaultPersistCrypto((v: string) => v),
        decrypt: markDefaultPersistCrypto((v: string) => v),
        allowPlaintext: false,
        sensitiveData: false,
        onMigrationFail: "reset" as const,
        checksum: "hash" as const,
    };

    if (persist === true) {
        return {
            driver: safeStorage("localStorage"),
            ...base,
        };
    }

    if (typeof persist === "string") {
        return {
            driver: safeStorage(persist),
            ...base,
        };
    }

    const encrypt = persist.encrypt || base.encrypt;
    const decrypt = persist.decrypt || base.decrypt;
    const encryptAsync = persist.encryptAsync;
    const decryptAsync = persist.decryptAsync;
    const sensitiveData = persist.sensitiveData === true;
    const allowPlaintext = persist.allowPlaintext === true;
    const maxSize = typeof persist.maxSize === "number" && Number.isFinite(persist.maxSize) && persist.maxSize > 0
        ? persist.maxSize
        : undefined;
    const checksum = persist.checksum === "sha256"
        ? "sha256"
        : (persist.checksum === "none" ? "none" : "hash");

    if ((encryptAsync && !decryptAsync) || (!encryptAsync && decryptAsync)) {
        throw new Error(
            `[stroid/persist] Store "${name}" must provide both encryptAsync and decryptAsync when using async crypto.`
        );
    }

    if (sensitiveData && isIdentityStringTransform(encrypt) && !encryptAsync) {
        throw new Error(
            `[stroid/persist] Store "${name}" is marked sensitiveData but is configured to persist in plaintext. ` +
            `Provide encrypt/decrypt hooks to protect sensitive data.`,
        );
    }

    return {
        driver: persist.driver || persist.storage || safeStorage("localStorage"),
        key: persist.key || base.key,
        serialize: persist.serialize || base.serialize,
        deserialize: persist.deserialize || base.deserialize,
        encrypt,
        decrypt,
        encryptAsync,
        decryptAsync,
        allowPlaintext,
        sensitiveData,
        maxSize,
        checksum,
        onMigrationFail: persist.onMigrationFail || "reset",
        onStorageCleared: persist.onStorageCleared,
    };
};

/**
 * Collect deprecation warnings for a store options object.
 *
 * This function walks through the store options object and checks if any
 * deprecated options are present. If a deprecated option is found, a
 * warning message is added to the warnings array.
 *
 * The function returns an array of warning messages. If no deprecated
 * options are found, an empty array is returned.
 *
 * @template State The type of the state stored in the store.
 * @param option The store options object to check for deprecated options.
 * @returns An array of warning messages for deprecated options. If no deprecated
 *          options are found, an empty array is returned.
 */
export const collectLegacyOptionDeprecationWarnings = <State>(option: StoreOptions<State>): string[] => {
    if (!isObject(option)) return [];

    const warnings: string[] = [];
    Object.entries(legacyOptionReplacementMap).forEach(([legacyKey, replacement]) => {
        if (!hasOwn(option, legacyKey)) return;
        if (warnedLegacyOptions.has(legacyKey)) return;
        warnedLegacyOptions.add(legacyKey);
        warnings.push(`createStore option "${legacyKey}" is deprecated. Use "${replacement}" instead.`);
    });
    return warnings;
};

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
    defaultSnapshotMode: SnapshotMode = "deep"
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
        snapshotSafety: normalizedSnapshotSafety,
        explicitPersist,
        explicitSync,
        explicitDevtools,
    };
};
