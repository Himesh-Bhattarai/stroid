export type StoreValue = unknown;

export interface PersistDriver {
    getItem?: (k: string) => string | null;
    setItem?: (k: string, v: string) => void;
    removeItem?: (k: string) => void;
    [key: string]: unknown;
}

export interface PersistOptions {
    driver?: PersistDriver;
    storage?: PersistDriver;
    key?: string;
    serialize?: (v: unknown) => string;
    deserialize?: (v: string) => unknown;
    encrypt?: (v: string) => string;
    decrypt?: (v: string) => string;
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

export interface StoreOptions<State = StoreValue> {
    persist?: boolean | string | PersistOptions;
    devtools?: boolean;
    middleware?: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    onSet?: (prev: State, next: State) => void;
    onReset?: (prev: State, next: State) => void;
    onDelete?: (prev: State) => void;
    onCreate?: (initial: State) => void;
    onError?: (err: string) => void;
    validator?: (next: State) => boolean;
    schema?: unknown;
    migrations?: Record<number, (state: State) => State>;
    version?: number;
    redactor?: (state: State) => State;
    historyLimit?: number;
    allowSSRGlobalStore?: boolean;
    sync?: boolean | SyncOptions;
}

export interface NormalizedOptions {
    persist: PersistConfig | null;
    devtools: boolean;
    middleware: Array<(ctx: MiddlewareCtx) => StoreValue | void>;
    onSet?: (prev: StoreValue, next: StoreValue) => void;
    onReset?: (prev: StoreValue, next: StoreValue) => void;
    onDelete?: (prev: StoreValue) => void;
    onCreate?: (initial: StoreValue) => void;
    onError?: (err: string) => void;
    validator?: (next: StoreValue) => boolean;
    schema?: unknown;
    migrations: Record<number, (state: any) => any>;
    version: number;
    redactor?: (state: StoreValue) => StoreValue;
    historyLimit: number;
    allowSSRGlobalStore?: boolean;
    sync?: boolean | SyncOptions;
}

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

export const normalizePersistOptions = (
    persist: StoreOptions["persist"],
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

export const normalizeStoreOptions = <State>(
    option: StoreOptions<State> = {},
    name: string
): NormalizedOptions => {
    const {
        persist = false,
        devtools = false,
        middleware = [],
        onSet,
        onReset,
        onDelete,
        onCreate,
        onError,
        validator,
        schema,
        migrations = {},
        version = 1,
        redactor,
        historyLimit = 50,
        sync,
        allowSSRGlobalStore = option.allowSSRGlobalStore ?? false,
    } = option;

    return {
        persist: normalizePersistOptions(persist, name),
        devtools: !!devtools,
        middleware: middleware ?? [],
        onSet: onSet as NormalizedOptions["onSet"],
        onReset: onReset as NormalizedOptions["onReset"],
        onDelete: onDelete as NormalizedOptions["onDelete"],
        onCreate: onCreate as NormalizedOptions["onCreate"],
        onError,
        validator: validator as NormalizedOptions["validator"],
        schema,
        migrations: migrations as NormalizedOptions["migrations"],
        version,
        redactor: redactor as NormalizedOptions["redactor"],
        historyLimit,
        sync: sync ?? false,
        allowSSRGlobalStore,
    };
};
