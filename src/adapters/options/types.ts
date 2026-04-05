/**
 * @module adapters/options/types
 *
 * LAYER: Module
 * OWNS:  Shared option and config types for store adapters.
 */
import type { TraceContext } from "../../types/utility.js";

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
export type ResetCloneMode = "deep" | "shallow" | "none";

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
     * - `windowMs`: customize the guard window in milliseconds
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
     * Clone strategy used by resetStore(...) when restoring the initial snapshot.
     * - "deep" (default): deep clone initial snapshot (safest).
     * - "shallow": clone top-level container only.
     * - "none": reuse initial snapshot reference.
     */
    resetClone?: ResetCloneMode;
    /**
     * Safety policy for snapshot deliveries when using "ref" or "shallow" modes.
     * - "warn": (default) log a warning in dev when mutation is detected.
     * - "throw": throw an error in dev when mutation is detected.
     * - "auto-clone": in dev, if a subscriber mutates a frozen snapshot, deliver a cloned
     *   snapshot to that subscriber so the mutation does not affect other subscribers or the store.
     */
    snapshotSafety?: "warn" | "throw" | "auto-clone";
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
    migrations: Record<number, (state: StoreValue) => StoreValue>;
    version: number;
    redactor?: (state: StoreValue) => StoreValue;
    historyLimit: number;
    allowSSRGlobalStore?: boolean;
    sync?: boolean | SyncOptions;
    features?: FeatureOptions;
    snapshot: SnapshotMode;
    resetClone: ResetCloneMode;
    /** normalized snapshotSafety value */
    snapshotSafety?: "warn" | "throw" | "auto-clone";
    explicitPersist: boolean;
    explicitSync: boolean;
    explicitDevtools: boolean;
}
