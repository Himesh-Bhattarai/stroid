export type StoreValue = unknown;

export interface PersistDriver {
    getItem?: (k: string) => string | null;
    setItem?: (k: string, v: string) => void;
    removeItem?: (k: string) => void;
    [key: string]: unknown;
}

export type StoreScope = "request" | "global" | "temp";

export type ValidateOption<State = StoreValue> = unknown | ((next: State) => boolean | State);

export interface PersistOptions<State = StoreValue> {
    driver?: PersistDriver;
    storage?: PersistDriver;
    key?: string;
    serialize?: (v: unknown) => string;
    deserialize?: (v: string) => unknown;
    encrypt?: (v: string) => string;
    decrypt?: (v: string) => string;
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
    onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown);
    onStorageCleared?: (info: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => void;
}

export interface MiddlewareCtx {
    action: string;
    name: string;
    prev: StoreValue;
    next: StoreValue;
    path: unknown;
}

export interface SyncOptions {
    channel?: string;
    maxPayloadBytes?: number;
    conflictResolver?: (args: {
        local: StoreValue;
        incoming: StoreValue;
        localUpdated: number;
        incomingUpdated: number;
    }) => StoreValue | void;
}

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
}

export interface NormalizedOptions {
    scope: StoreScope;
    lazy: boolean;
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
    explicitPersist: boolean;
    explicitSync: boolean;
    explicitDevtools: boolean;
}

const warnedLegacyOptions = new Set<string>();

export const resetLegacyOptionDeprecationWarningsForTests = (): void => {
    warnedLegacyOptions.clear();
};

const memoryStorage: PersistDriver = (() => {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); },
        type: "memory",
    };
})();

const safeStorage = (type: string): PersistDriver => {
    try {
        if (typeof window === "undefined") return memoryStorage;
        if (type === "session" || type === "sessionStorage") return window.sessionStorage ?? memoryStorage;
        return window.localStorage ?? memoryStorage;
    } catch (_) {
        return memoryStorage;
    }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

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

export const normalizePersistOptions = <State>(
    persist: StoreOptions<State>["persist"],
    name: string
): PersistConfig | null => {
    if (!persist) return null;

    const base = {
        key: `stroid_${name}`,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        onMigrationFail: "reset" as const,
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

    return {
        driver: persist.driver || persist.storage || safeStorage("localStorage"),
        key: persist.key || base.key,
        serialize: persist.serialize || base.serialize,
        deserialize: persist.deserialize || base.deserialize,
        encrypt: persist.encrypt || base.encrypt,
        decrypt: persist.decrypt || base.decrypt,
        onMigrationFail: persist.onMigrationFail || "reset",
        onStorageCleared: persist.onStorageCleared,
    };
};

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

export const normalizeStoreOptions = <State>(
    option: StoreOptions<State> = {},
    name: string
): NormalizedOptions => {
    const normalizedScope: StoreScope = option.scope ?? "request";
    const normalizedLazy = option.lazy === true;
    const lifecycle = isObject(option.lifecycle) ? option.lifecycle as LifecycleOptions<State> : undefined;
    const persistGroup = isObject(option.persist) ? option.persist as PersistOptions<State> : undefined;
    const devtoolsGroup = isObject(option.devtools) ? option.devtools as DevtoolsOptions<State> : undefined;
    const normalizedValidate = option.validate ?? option.validator ?? option.schema;
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

    return {
        scope: normalizedScope,
        lazy: normalizedLazy,
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
        allowSSRGlobalStore: normalizedAllowSSRGlobalStore,
        explicitPersist,
        explicitSync,
        explicitDevtools,
    };
};
