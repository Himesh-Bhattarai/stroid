import {
    warn,
    error,
    log,
    isDev,
    isValidData,
    isValidStoreName,
    sanitize,
    validateDepth,
    getByPath,
    setByPath,
    parsePath,
    suggestStoreName,
    deepClone,
    produceClone,
    hashState,
    runSchemaValidation,
    getType,
    PathInput,
} from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
type PathInternal<T, Depth extends number> = Depth extends 0
    ? never
    : T extends Primitive
        ? never
        : {
            [K in keyof T & (string | number)]: T[K] extends Primitive | Array<unknown>
                ? `${K}`
                : `${K}` | `${K}.${PathInternal<T[K], PrevDepth[Depth]>}`
        }[keyof T & (string | number)];

export type Path<T, Depth extends number = 6> = PathInternal<T, Depth>;

export type PathValue<T, P extends Path<T>> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? Rest extends Path<T[K]>
            ? PathValue<T[K], Rest>
            : never
        : never
    : P extends keyof T
        ? T[P]
        : never;

export type PartialDeep<T> = T extends Primitive
    ? T
    : { [K in keyof T]?: PartialDeep<T[K]> };

export type StoreValue = unknown;

export interface StoreDefinition<Name extends string = string, State = StoreValue> {
    name: Name;
    // marker for inference only, not used at runtime
    state?: State;
}

export interface PersistConfig {
    driver: {
        getItem?: (k: string) => string | null;
        setItem?: (k: string, v: string) => void;
        removeItem?: (k: string) => void;
        [key: string]: unknown;
    };
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

export interface StoreOptions<State = StoreValue> {
    persist?: boolean | string | PersistConfig;
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
    sync?: boolean | {
        channel?: string;
        maxPayloadBytes?: number;
        conflictResolver?: (args: {
            local: StoreValue;
            incoming: StoreValue;
            localUpdated: number;
            incomingUpdated: number;
        }) => StoreValue | void;
    };
}

type NormalizedOptions = {
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
    sync?: boolean | {
        channel?: string;
        maxPayloadBytes?: number;
        conflictResolver?: (args: { local: StoreValue; incoming: StoreValue; localUpdated: number; incomingUpdated: number; }) => StoreValue | void;
    };
};

interface MetaEntry {
    createdAt: string;
    updatedAt: string;
    updateCount: number;
    version: number;
    metrics: { notifyCount: number; totalNotifyMs: number; lastNotifyMs: number };
    options: NormalizedOptions;
}

interface HistoryEntry {
    ts: number;
    action: string;
    prev: StoreValue;
    next: StoreValue;
    diff: { added: string[]; removed: string[]; changed: string[] } | null;
}

type Subscriber = (value: StoreValue | null) => void;

const _stores: Record<string, StoreValue> = Object.create(null);
const _subscribers: Record<string, Subscriber[]> = Object.create(null);
const _initial: Record<string, StoreValue> = Object.create(null);
const _meta: Record<string, MetaEntry> = Object.create(null);
const _history: Record<string, HistoryEntry[]> = Object.create(null);
const _syncChannels: Record<string, BroadcastChannel> = Object.create(null);
const _syncClocks: Record<string, number> = Object.create(null);
const _syncWindowCleanup: Record<string, () => void> = Object.create(null);
const _snapshotCache: Record<string, { source: StoreValue; snapshot: StoreValue | null }> = Object.create(null);

const _pendingNotifications = new Set<string>();
let _notifyScheduled = false;
let _batchDepth = 0;
const INSTANCE_ID = `stroid_${Math.random().toString(16).slice(2)}`;
const _persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const _persistKeys: Record<string, string> = Object.create(null);
const _persistWatchState: Record<string, { lastPresent: boolean; dispose: () => void }> = Object.create(null);
let _ssrWarningIssued = false;
const _nameOf = (name: string | StoreDefinition<string, StoreValue>): string =>
    typeof name === "string" ? name : name.name;

// DevTools (Redux DevTools extension)
let _devtools: any;

const memoryStorage = (() => {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); },
        type: "memory",
    };
})();

const _scheduleFlush = (): void => {
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    const run = () => {
        _notifyScheduled = false;
        const names = Array.from(_pendingNotifications);
        _pendingNotifications.clear();
        names.forEach((name) => {
            const subs = _subscribers[name];
            if (!subs || subs.length === 0) return;
            const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const snapshot = deepClone(_stores[name]);
            subs.forEach((fn) => {
                try { fn(snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            });
            const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const delta = end - start;
            const metrics = _meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += delta;
            metrics.lastNotifyMs = delta;
            if (_meta[name]) _meta[name].metrics = metrics;
        });
        if (_pendingNotifications.size > 0) _scheduleFlush();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};

const _notify = (name: string): void => {
    _pendingNotifications.add(name);
    if (_batchDepth === 0) _scheduleFlush();
};

const _hasStoreEntry = (name: string): boolean => Object.prototype.hasOwnProperty.call(_stores, name);

const _exists = (name: string): boolean => {
    if (_hasStoreEntry(name)) return true;
    suggestStoreName(name, Object.keys(_stores));
    return false;
};

const _validatePathSafety = (storeName: string, base: StoreValue, path: PathInput, nextValue: unknown): { ok: boolean; reason?: string } => {
    const parts = parsePath(path);
    if (parts.length === 0) return { ok: true };

    if (base === null || base === undefined) {
        const reason = `Cannot set "${parts.join(".")}" on "${storeName}" because the store value is ${base === null ? "null" : "undefined"}.`;
        warn(reason);
        return { ok: false, reason };
    }

    let cursor: unknown = base;
    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];
        const isLast = i === parts.length - 1;

        if (cursor === null || cursor === undefined || typeof cursor !== "object") {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is not an object.`;
            warn(reason);
            return { ok: false, reason };
        }

        if (Array.isArray(cursor)) {
            const idx = Number(key);
            if (!Number.isInteger(idx) || idx < 0) {
                const reason = `Path "${parts.join(".")}" targets non-numeric index "${key}" on an array in "${storeName}".`;
                warn(reason);
                return { ok: false, reason };
            }

            const arr = cursor as unknown[];
            if (idx >= arr.length) {
                const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - index ${idx} is out of bounds (length ${arr.length}).`;
                warn(reason);
                return { ok: false, reason };
            }

            if (isLast) {
                const existing = arr[idx];
                if (existing !== undefined) {
                    const expected = getType(existing);
                    const incoming = getType(nextValue);
                    if (expected !== incoming) {
                        const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incoming}.`;
                        warn(reason);
                        return { ok: false, reason };
                    }
                }
                return { ok: true };
            }
            cursor = arr[idx];
            continue;
        }

        const hasKey = Object.prototype.hasOwnProperty.call(cursor as Record<string, unknown>, key);
        if (!hasKey) {
            const reason = `Path "${parts.join(".")}" does not exist on store "${storeName}" (missing "${key}").`;
            warn(reason);
            return { ok: false, reason };
        }
        if (isLast) {
            const existing = (cursor as Record<string, unknown>)[key];
            if (existing !== undefined) {
                const expected = getType(existing);
                const incoming = getType(nextValue);
                if (expected !== incoming) {
                    const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incoming}.`;
                    warn(reason);
                    return { ok: false, reason };
                }
            }
            return { ok: true };
        }
        cursor = (cursor as Record<string, unknown>)[key];
    }
    return { ok: true };
};

const _safeStorage = (type: string) => {
    try {
        if (typeof window === "undefined") return memoryStorage;
        if (type === "session" || type === "sessionStorage") return window.sessionStorage ?? memoryStorage;
        return window.localStorage ?? memoryStorage;
    } catch (_) {
        return memoryStorage;
    }
};

const _setPersistPresence = (name: string, present: boolean): void => {
    if (_persistWatchState[name]) {
        _persistWatchState[name].lastPresent = present;
    }
};

const _normalizePersist = (persist: StoreOptions<StoreValue>["persist"], name: string): PersistConfig | null => {
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
            driver: _safeStorage("localStorage"),
            ...base,
        };
    }
    if (typeof persist === "string") {
        return {
            driver: _safeStorage(persist),
            ...base,
        };
    }
    return {
        driver: (persist as any).driver || (persist as any).storage || _safeStorage("localStorage"),
        key: persist.key || base.key,
        serialize: persist.serialize || base.serialize,
        deserialize: persist.deserialize || base.deserialize,
        encrypt: persist.encrypt || base.encrypt,
        decrypt: persist.decrypt || base.decrypt,
        onMigrationFail: persist.onMigrationFail || "reset",
        onStorageCleared: persist.onStorageCleared,
    };
};

const _setupPersistWatch = (name: string): void => {
    const cfg = _meta[name]?.options?.persist;
    const callback = cfg?.onStorageCleared;
    if (!cfg || typeof callback !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function") return;

    _persistWatchState[name]?.dispose();
    const hostWindow = window;

    const readPresent = (): boolean => {
        try {
            return cfg.driver.getItem?.(cfg.key) != null;
        } catch (_) {
            return false;
        }
    };

    const notifyIfCleared = (reason: "clear" | "remove" | "missing"): void => {
        const state = _persistWatchState[name];
        const present = readPresent();
        if (!state) return;
        if (!state.lastPresent || present) {
            state.lastPresent = present;
            return;
        }
        state.lastPresent = false;
        callback({ name, key: cfg.key, reason });
    };

    const onStorage = (event: StorageEvent): void => {
        if (event.key === null) {
            notifyIfCleared("clear");
            return;
        }
        if (event.key === cfg.key && event.newValue === null) {
            notifyIfCleared("remove");
        }
    };

    const onFocus = (): void => {
        notifyIfCleared("missing");
    };

    hostWindow.addEventListener("storage", onStorage);
    hostWindow.addEventListener("focus", onFocus);

    _persistWatchState[name] = {
        lastPresent: readPresent(),
        dispose: () => {
            hostWindow.removeEventListener("storage", onStorage);
            hostWindow.removeEventListener("focus", onFocus);
        },
    };
};

const _devtoolsInit = (name: string): void => {
    const useDevtools = _meta[name]?.options?.devtools;
    if (!useDevtools) return;
    if (typeof window === "undefined") return;
    const ext = (window as any).__REDUX_DEVTOOLS_EXTENSION__ || (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    if (!ext || typeof ext.connect !== "function") {
        warn(`DevTools requested for "${name}" but Redux DevTools extension not found.`);
        return;
    }
    if (!_devtools) {
        _devtools = ext.connect({ name: "stroid" });
        _devtools.init(_stores);
    }
};

const _applyRedactor = (name: string, data: StoreValue): StoreValue => {
    const redactor = _meta[name]?.options?.redactor;
    if (typeof redactor === "function") {
        try { return redactor(deepClone(data)); }
        catch (_) { return data; }
    }
    return data;
};

const _byteLength = (value: string): number => {
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(value).length;
    }
    if (typeof Buffer !== "undefined") {
        return Buffer.byteLength(value);
    }
    return value.length;
};

const _reportStoreError = (name: string, message: string): void => {
    _meta[name]?.options?.onError?.(message);
    warn(message);
};

const _resolveMigrationFailure = (
    name: string,
    persisted: StoreValue,
    reason: string
): { state: StoreValue; requiresValidation: boolean } => {
    _reportStoreError(name, reason);

    const strategy = _meta[name]?.options?.persist?.onMigrationFail ?? "reset";
    if (strategy === "keep") {
        return { state: persisted, requiresValidation: false };
    }

    if (typeof strategy === "function") {
        try {
            const next = strategy(deepClone(persisted));
            if (next !== undefined) {
                return { state: sanitize(next) as StoreValue, requiresValidation: true };
            }
            _reportStoreError(name, `onMigrationFail for "${name}" returned undefined. Falling back to initial state.`);
        } catch (err) {
            _reportStoreError(name, `onMigrationFail for "${name}" failed: ${(err as { message?: string })?.message ?? err}`);
        }
    }

    return { state: deepClone(_initial[name]), requiresValidation: false };
};

const _diffShallow = (prev: StoreValue, next: StoreValue): { added: string[]; removed: string[]; changed: string[] } | null => {
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) return null;
    const prevObj = prev as Record<string, unknown>;
    const nextObj = next as Record<string, unknown>;
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const prevKeys = new Set(Object.keys(prevObj));
    const nextKeys = new Set(Object.keys(nextObj));
    nextKeys.forEach((k) => {
        if (!prevKeys.has(k)) added.push(k);
        else if (!Object.is(prevObj[k], nextObj[k])) changed.push(k);
    });
    prevKeys.forEach((k) => {
        if (!nextKeys.has(k)) removed.push(k);
    });
    return { added, removed, changed };
};

const _pushHistory = (name: string, action: string, prev: StoreValue, next: StoreValue): void => {
    const limit = _meta[name]?.options?.historyLimit ?? 50;
    if (limit === 0) return;
    if (!_history[name]) _history[name] = [];
    const entry: HistoryEntry = {
        ts: Date.now(),
        action,
        prev: deepClone(_applyRedactor(name, prev)),
        next: deepClone(_applyRedactor(name, next)),
        diff: _diffShallow(prev, next),
    };
    _history[name].push(entry);
    if (_history[name].length > limit) {
        _history[name].splice(0, _history[name].length - limit);
    }
};

const _devtoolsSend = (name: string, action: string, force = false): void => {
    if (!_devtools || (!force && !_meta[name]?.options?.devtools)) return;
    try {
        const state = { ..._stores, [name]: _applyRedactor(name, _stores[name]) };
        _devtools.send({ type: `${name}/${action}` }, state);
    } catch (_) { /* ignore */ }
};

const _runMiddleware = (name: string, payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown; }): StoreValue => {
    const middlewares = _meta[name]?.options?.middleware || [];
    if (!Array.isArray(middlewares)) return payload.next;
    let nextState = payload.next;
    for (const mw of middlewares) {
        if (typeof mw !== "function") continue;
        let result: StoreValue | void;
        try {
            result = mw({
                action: payload.action,
                name,
                prev: payload.prev,
                next: nextState,
                path: payload.path,
            });
        } catch (err) {
            const msg = `Middleware for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
            _meta[name]?.options?.onError?.(msg);
            warn(msg);
            continue;
        }
        if (result !== undefined) nextState = result;
    }
    return nextState;
};

const _validateSchema = (name: string, next: StoreValue): { ok: boolean } => {
    const schema = _meta[name]?.options?.schema;
    if (!schema) return { ok: true };
    const res = runSchemaValidation(schema, next);
    if (!res.ok) {
        _reportStoreError(name, `Schema validation failed for "${name}": ${res.error}`);
    }
    return res as { ok: boolean };
};

const _runValidator = (
    name: string,
    value: StoreValue,
    validator?: (next: StoreValue) => boolean,
    onError?: (message: string) => void
): boolean => {
    const report = (message: string): void => {
        _meta[name]?.options?.onError?.(message);
        onError?.(message);
        warn(message);
    };
    if (typeof validator !== "function") return true;
    try {
        if (validator(value) === false) {
            const message = `Validator blocked update for "${name}"`;
            _meta[name]?.options?.onError?.(message);
            onError?.(message);
            return false;
        }
        return true;
    } catch (err) {
        const message = `Validator for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
        report(message);
        return false;
    }
};

const _runStoreHook = (
    name: string,
    label: "onCreate" | "onSet" | "onReset" | "onDelete",
    fn: ((...args: any[]) => void) | undefined,
    args: any[]
): void => {
    if (typeof fn !== "function") return;
    try {
        fn(...args);
    } catch (err) {
        const message = `${label} for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
        _meta[name]?.options?.onError?.(message);
        warn(message);
    }
};

const _sanitizeValue = (
    name: string,
    value: unknown,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    try {
        return { ok: true, value: sanitize(value) as StoreValue };
    } catch (err) {
        const message = `Sanitize failed for "${name}": ${(err as { message?: string })?.message ?? err}`;
        _meta[name]?.options?.onError?.(message);
        onError?.(message);
        warn(message);
        return { ok: false };
    }
};

const _persistSave = (name: string): void => {
    const cfg = _meta[name]?.options?.persist;
    if (!cfg) return;
    if (_persistTimers[name]) clearTimeout(_persistTimers[name]);
    _persistTimers[name] = setTimeout(() => {
        delete _persistTimers[name];
        const meta = _meta[name];
        if (!meta?.options?.persist || meta.options.persist !== cfg || !_exists(name)) return;
        try {
            const serialized = cfg.serialize(_stores[name]);
            const checksum = hashState(serialized);
        const envelope = JSON.stringify({
            v: _meta[name]?.version ?? 1,
            checksum,
            data: serialized,
        });
        const payload = cfg.encrypt(envelope);
        cfg.driver.setItem?.(cfg.key, payload);
        _setPersistPresence(name, true);
    } catch (e) {
        _reportStoreError(name, `Could not persist store "${name}" (${(e as { message?: string })?.message || e})`);
    }
}, 0);
};

const _persistLoad = (name: string, { silent } = { silent: false }): boolean => {
    const cfg = _meta[name]?.options?.persist;
    if (!cfg) return false;
    try {
        const raw = cfg.driver.getItem?.(cfg.key) ?? null;
        if (!raw) return false;
        const decrypted = cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data } = envelope || {};
        if (!data) return true;
        if (checksum !== hashState(data)) {
            _reportStoreError(name, `Checksum mismatch loading store "${name}". Falling back to initial state.`);
            _stores[name] = deepClone(_initial[name]);
            return true;
        }
        let parsed = cfg.deserialize(data);
        const targetVersion = _meta[name]?.version ?? 1;
        if (v !== targetVersion) {
            const migrations = _meta[name]?.options?.migrations || {};
            const steps = Object.keys(migrations)
                .map((k) => Number(k))
                .filter((ver) => ver > v && ver <= targetVersion)
                .sort((a, b) => a - b);

            if (steps.length === 0) {
                const fallback = _resolveMigrationFailure(
                    name,
                    parsed,
                    `No migration path from v${v} to v${targetVersion} for "${name}". Applying onMigrationFail strategy.`
                );
                parsed = fallback.state;
                if (!fallback.requiresValidation) {
                    _stores[name] = parsed;
                    return true;
                }
            }

            let migrationFailed = false;
            let migrationFailureRequiresValidation = true;
            steps.forEach((ver) => {
                if (migrationFailed) return;
                try {
                    const migrated = migrations[ver](parsed);
                    if (migrated !== undefined) parsed = migrated;
                } catch (e) {
                    const fallback = _resolveMigrationFailure(
                        name,
                        parsed,
                        `Migration to v${ver} failed for "${name}": ${(e as { message?: string })?.message || e}`
                    );
                    parsed = fallback.state;
                    migrationFailureRequiresValidation = fallback.requiresValidation;
                    migrationFailed = true;
                }
            });

            if (migrationFailed) {
                if (!migrationFailureRequiresValidation) {
                    _stores[name] = parsed;
                    return true;
                }
                const recoveredSchema = _validateSchema(name, parsed);
                if (!recoveredSchema.ok) {
                    _stores[name] = deepClone(_initial[name]);
                    return true;
                }
                _stores[name] = parsed;
                return true;
            }
        }
        const schemaResult = _validateSchema(name, parsed);
        if (!schemaResult.ok) {
            if (v !== targetVersion) {
                const fallback = _resolveMigrationFailure(
                    name,
                    parsed,
                    `Persisted state for "${name}" failed schema after version change. Applying onMigrationFail strategy.`
                );
                if (!fallback.requiresValidation) {
                    _stores[name] = fallback.state;
                    return true;
                }

                const recoveredSchema = _validateSchema(name, fallback.state);
                if (recoveredSchema.ok) {
                    _stores[name] = fallback.state;
                    return true;
                }
            }
            _reportStoreError(name, `Persisted state for "${name}" failed schema; resetting to initial.`);
            _stores[name] = deepClone(_initial[name]);
            return true;
        }
        _stores[name] = parsed;
        if (!silent) log(`Store "${name}" loaded from persistence`);
        return true;
    } catch (e) {
        _reportStoreError(name, `Could not load store "${name}" (${(e as { message?: string })?.message || e})`);
        return true;
    }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const createStore = <Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> | undefined => {
    if (!isValidStoreName(name)) return;
    if (!isValidData(initialData)) return;

    const isServer = typeof window === "undefined";
    const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
    const isProdServer = isServer && nodeEnv === "production";
    const allowGlobalSSR = option.allowSSRGlobalStore ?? false;

    if (isProdServer && !allowGlobalSSR) {
        if (isDev()) {
            error(
                `createStore("${name}") is blocked on the server in production to prevent cross-request memory leaks.\n` +
                `Call createStoreForRequest(...) inside each request scope or pass { allowSSRGlobalStore: true } to opt in.`
            );
        }
        return;
    }

    if (_hasStoreEntry(name)) {
        const msg = `Store "${name}" already exists. Call setStore("${name}", data) to update instead.`;
        warn(msg);
        _meta[name]?.options?.onError?.(msg);
        return { name } as StoreDefinition<Name, State>;
    }

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
        allowSSRGlobalStore = allowGlobalSSR,
    } = option;

    if (isServer && !allowSSRGlobalStore && !_ssrWarningIssued && isDev()) {
        _ssrWarningIssued = true;
        warn(
            `createStore(\"${name}\") called in a server environment. ` +
            `Use createStoreForRequest(...) per request to avoid cross-request leaks ` +
            `or pass { allowSSRGlobalStore: true } if you really want a global store on the server.`
        );
    }

    const persistConfig = _normalizePersist(persist, name);
    if (persistConfig?.key) {
        const existing = _persistKeys[persistConfig.key];
        if (existing && existing !== name && isDev()) {
            warn(
                `Persist key collision: "${persistConfig.key}" already used by store "${existing}". ` +
                `Store "${name}" will overwrite the same storage key.`
            );
        } else {
            _persistKeys[persistConfig.key] = name;
        }
    }
    const cleanResult = _sanitizeValue(name, initialData, onError);
    if (!cleanResult.ok) return;
    const clean = cleanResult.value;
    const normalizedOptions: NormalizedOptions = {
        persist: persistConfig,
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

    const initialSchemaResult = schema ? runSchemaValidation(schema, clean) : { ok: true };
    if (!initialSchemaResult.ok) {
        const msg = `Schema validation failed for "${name}": ${initialSchemaResult.error}`;
        onError?.(msg);
        warn(msg);
        return;
    }

    if (!_runValidator(
        name,
        clean as StoreValue,
        validator as unknown as ((next: StoreValue) => boolean) | undefined,
        onError
    )) {
        const msg = `Validator blocked initial state for "${name}"`;
        return;
    }

    _stores[name] = clean;
    _subscribers[name] = _subscribers[name] || [];
    _initial[name] = deepClone(clean);
    _meta[name] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updateCount: 0,
        version,
        metrics: { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
        options: normalizedOptions,
    };

    if (persistConfig) {
        const hadPersistedState = _persistLoad(name, { silent: true });
        if (!hadPersistedState) _persistSave(name);
        _setupPersistWatch(name);
    }

    _runStoreHook(name, "onCreate", _meta[name].options.onCreate, [clean]);
    _devtoolsInit(name);
    _setupSync(name);
    _pushHistory(name, "create", null, clean);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return { name } as StoreDefinition<Name, State>;
};

type KeyOrData = string | string[] | Record<string, unknown> | ((draft: any) => void);

export function setStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P, value: PathValue<State, P>): void;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, mutator: (draft: State) => void): void;
export function setStore<Name extends string, State>(name: StoreDefinition<Name, State>, data: PartialDeep<State>): void;
export function setStore(name: string, data: Record<string, unknown>): void;
export function setStore(name: string, path: string | string[], value: unknown): void;
export function setStore(name: string, mutator: (draft: any) => void): void;
export function setStore(name: string | StoreDefinition<string, StoreValue>, keyOrData: KeyOrData, value?: unknown): void {
    const storeName = _nameOf(name);
    if (!_exists(storeName)) return;
    let updated: StoreValue;
    const prev = _stores[storeName];

    if (typeof keyOrData === "function" && value === undefined) {
        updated = produceClone(prev, keyOrData as (draft: any) => void);
    } else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) return;
        if (typeof prev !== "object" || prev === null || Array.isArray(prev)) {
            error(
                `setStore("${storeName}", data) only merges into object stores.\n` +
                `Use setStore("${storeName}", "path", value) or recreate the store with an object shape.`
            );
            return;
        }
        const partialResult = _sanitizeValue(storeName, keyOrData);
        if (!partialResult.ok) return;
        updated = { ...(prev as Record<string, unknown>), ...partialResult.value as Record<string, unknown> };
    } else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData as PathInput)) return;
        const valueResult = _sanitizeValue(storeName, value);
        if (!valueResult.ok) return;
        const sanitizedValue = valueResult.value;
        const safePath = _validatePathSafety(storeName, prev, keyOrData as PathInput, sanitizedValue);
        if (!safePath.ok) {
            _meta[storeName]?.options?.onError?.(safePath.reason ?? `Invalid path for "${storeName}".`);
            return;
        }
        updated = setByPath(prev as Record<string, unknown>, keyOrData as PathInput, sanitizedValue);
    } else {
        error(
            `setStore("${storeName}") - invalid arguments.\n` +
            `Usage:\n` +
            `  setStore("${storeName}", "field", value)\n` +
            `  setStore("${storeName}", "nested.field", value)\n` +
            `  setStore("${storeName}", { field: value })`
        );
        return;
    }

    if (!isValidData(updated)) return;
    const updateResult = _sanitizeValue(storeName, updated);
    if (!updateResult.ok) return;
    const sanitizedUpdate = updateResult.value;

    const schemaCheck = _validateSchema(storeName, sanitizedUpdate);
    if (!schemaCheck.ok) return;

    const validator = _meta[storeName]?.options?.validator;
    if (!_runValidator(storeName, sanitizedUpdate, validator)) {
        return;
    }

    const next = _runMiddleware(storeName, { action: "set", prev, next: sanitizedUpdate, path: keyOrData });
    _stores[storeName] = isDev() ? devDeepFreeze(next) : next;
    _meta[storeName].updatedAt = new Date().toISOString();
    _meta[storeName].updateCount++;
    _bumpSyncClock(storeName);

    if (_meta[storeName].options?.persist) _persistSave(storeName);
    _runStoreHook(storeName, "onSet", _meta[storeName].options.onSet, [prev, next]);
    _pushHistory(storeName, "set", prev, next);
    _devtoolsSend(storeName, "set");
    _broadcastSync(storeName);
    _notify(storeName);

    log(`Store "${storeName}" updated`);
}

export const setStoreBatch = (fn: () => void): void => {
    if (typeof fn !== "function") {
        throw new Error("setStoreBatch requires a synchronous function callback.");
    }
    if ((fn as Function).constructor?.name === "AsyncFunction") {
        throw new Error("setStoreBatch does not support async functions.");
    }
    _batchDepth++;
    try {
        const result = fn();
        if (result && typeof (result as Promise<unknown>).then === "function") {
            throw new Error("setStoreBatch does not support promise-returning callbacks.");
        }
    } finally {
        _batchDepth = Math.max(0, _batchDepth - 1);
        if (_batchDepth === 0 && _pendingNotifications.size > 0) {
            _scheduleFlush();
        }
    }
};

export function getStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P): PathValue<State, P> | null;
export function getStore<Name extends string, State>(name: StoreDefinition<Name, State>, path?: undefined): State | null;
export function getStore(name: string, path?: PathInput): StoreValue | null;
export function getStore(name: string | StoreDefinition<string, StoreValue>, path?: PathInput): StoreValue | null {
    const storeName = _nameOf(name);
    if (!_exists(storeName)) return null;
    const data = _stores[storeName];
    if (path === undefined) {
        return deepClone(data);
    }
    if (!validateDepth(path)) return null;
    return deepClone(getByPath(data, path));
}

export const deleteStore = (name: string): void => {
    if (!_exists(name)) return;
    const subs = _subscribers[name];
    subs?.forEach((fn) => {
        try {
            fn(null);
        } catch (err) {
            warn(`Subscriber for "${name}" threw during delete: ${(err as { message?: string })?.message ?? err}`);
        }
    });
    _runStoreHook(name, "onDelete", _meta[name].options.onDelete, [_stores[name]]);
    const cfg = _meta[name].options.persist;
    const devtoolsEnabled = _meta[name].options.devtools;

    if (_persistTimers[name]) {
        clearTimeout(_persistTimers[name]);
        delete _persistTimers[name];
    }

    delete _stores[name];
    delete _subscribers[name];
    delete _initial[name];
    delete _meta[name];
    delete _history[name];

    try {
    if (cfg?.driver?.removeItem) cfg.driver.removeItem(cfg.key);
    } catch (_) {}

    if (cfg?.key && _persistKeys[cfg.key] === name) delete _persistKeys[cfg.key];
    _persistWatchState[name]?.dispose();
    delete _persistWatchState[name];
    _syncChannels[name]?.close();
    delete _syncChannels[name];
    _syncWindowCleanup[name]?.();
    delete _syncWindowCleanup[name];
    delete _syncClocks[name];

    if (devtoolsEnabled) _devtoolsSend(name, "delete", true);
    log(`Store "${name}" deleted`);
};

export const resetStore = (name: string): void => {
    if (!_exists(name)) return;
    if (!_initial[name]) return;
    const prev = _stores[name];
    const resetValue = deepClone(_initial[name]);
    _stores[name] = isDev() ? devDeepFreeze(resetValue) : resetValue;
    _meta[name].updatedAt = new Date().toISOString();
    _bumpSyncClock(name);
    if (_meta[name].options?.persist) _persistSave(name);

    _runStoreHook(name, "onReset", _meta[name].options.onReset, [prev, resetValue]);
    _pushHistory(name, "reset", prev, resetValue);
    _devtoolsSend(name, "reset");
    _broadcastSync(name);
    _notify(name);
    log(`Store "${name}" reset to initial state/value`);
};

export const mergeStore = (name: string, data: Record<string, unknown>): void => {
    if (!_exists(name)) return;
    if (!isValidData(data)) return;
    const current = _stores[name];
    if (typeof current !== "object" || Array.isArray(current) || current === null) {
        error(
            `mergeStore("${name}") only works on object stores.\n` +
            `Use setStore("${name}", value) instead.`
        );
        return;
    }
    const mergeResult = _sanitizeValue(name, data);
    if (!mergeResult.ok) return;
    const next = { ...(current as Record<string, unknown>), ...mergeResult.value as Record<string, unknown> };

    const schemaCheck = _validateSchema(name, next);
    if (!schemaCheck.ok) return;

    const validator = _meta[name]?.options?.validator;
    if (!_runValidator(name, next, validator)) {
        return;
    }

    const final = _runMiddleware(name, { action: "merge", prev: current, next, path: null });
    _stores[name] = isDev() ? devDeepFreeze(final) : final;
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;
    _bumpSyncClock(name);
    if (_meta[name].options?.persist) _persistSave(name);
    _runStoreHook(name, "onSet", _meta[name].options.onSet, [current, final]);
    _pushHistory(name, "merge", current, final);
    _devtoolsSend(name, "merge");
    _broadcastSync(name);
    _notify(name);
    log(`Store "${name}" merged with data`);
};

const _replaceStoreState = (name: string, data: unknown, action = "hydrate"): void => {
    if (!_exists(name)) return;
    const prev = _stores[name];
    const nextResult = _sanitizeValue(name, data);
    if (!nextResult.ok) return;
    const nextValue = nextResult.value;

    const schemaCheck = _validateSchema(name, nextValue);
    if (!schemaCheck.ok) return;

    const validator = _meta[name]?.options?.validator;
    if (!_runValidator(name, nextValue, validator)) {
        return;
    }

    const final = _runMiddleware(name, { action, prev, next: nextValue, path: null });
    _stores[name] = isDev() ? devDeepFreeze(final) : final;
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;
    _bumpSyncClock(name);
    if (_meta[name].options?.persist) _persistSave(name);
    _runStoreHook(name, "onSet", _meta[name].options.onSet, [prev, final]);
    _pushHistory(name, action, prev, final);
    _devtoolsSend(name, action);
    _broadcastSync(name);
    _notify(name);
    log(`Store "${name}" hydrated`);
};

export const clearAllStores = (): void => {
    const names = Object.keys(_stores);
    names.forEach(deleteStore);
    warn(`All stores cleared (${names.length} stores removed)`);
};

export const hasStore = (name: string): boolean => _hasStoreEntry(name);
export const listStores = (): string[] => Object.keys(_stores);
export const getStoreMeta = (name: string): MetaEntry | null => (_exists(name) ? deepClone(_meta[name]) : null);

export const _subscribe = (name: string, fn: Subscriber): (() => void) => {
    if (!_subscribers[name]) _subscribers[name] = [];
    _subscribers[name].push(fn);
    return () => {
        _subscribers[name] = _subscribers[name].filter((s) => s !== fn);
    };
};

export const _getSnapshot = (name: string): StoreValue | null => {
    if (!_hasStoreEntry(name)) return null;
    const source = _stores[name];
    const cached = _snapshotCache[name];
    if (cached && cached.source === source) return cached.snapshot;
    const snapshot = deepClone(source);
    _snapshotCache[name] = { source, snapshot };
    return snapshot;
};

const _bumpSyncClock = (name: string): number => {
    _syncClocks[name] = (_syncClocks[name] ?? 0) + 1;
    return _syncClocks[name];
};

const _absorbSyncClock = (name: string, incomingClock: number): number => {
    _syncClocks[name] = Math.max(_syncClocks[name] ?? 0, incomingClock) + 1;
    return _syncClocks[name];
};

const _compareSyncOrder = (
    name: string,
    incoming: { clock?: number; updatedAt?: number; source?: string }
): number => {
    const localClock = _syncClocks[name] ?? 0;
    const incomingClock = typeof incoming.clock === "number" ? incoming.clock : 0;
    if (incomingClock !== localClock) return incomingClock - localClock;

    const localUpdated = new Date(_meta[name]?.updatedAt || 0).getTime();
    const incomingUpdated = typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
    if (incomingUpdated !== localUpdated) return incomingUpdated - localUpdated;

    const localSource = INSTANCE_ID;
    const incomingSource = incoming.source ?? "";
    return incomingSource.localeCompare(localSource);
};

const _requestSyncSnapshot = (name: string): void => {
    const channel = _syncChannels[name];
    if (!channel) return;
    try {
        channel.postMessage({
            type: "sync-request",
            source: INSTANCE_ID,
            name,
            requestedAt: Date.now(),
        });
    } catch (err) {
        _reportStoreError(name, `Failed to request sync snapshot for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
};

const _setupSync = (name: string): void => {
    const sync = _meta[name]?.options?.sync;
    if (!sync) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
        _reportStoreError(name, `Sync enabled for "${name}" but BroadcastChannel not available in this environment.`);
        return;
    }
    const channelName = typeof sync === "object" && sync.channel
        ? sync.channel
        : `stroid_sync_${name}`;
    try {
        const channel = new BroadcastChannel(channelName);
        _syncChannels[name] = channel;
        channel.onmessage = (event: MessageEvent) => {
            const msg = event.data as any;
            if (!msg || msg.source === INSTANCE_ID) return;
            if (msg.name !== name) return;
            if (_syncChannels[name] !== channel || !_hasStoreEntry(name) || !_meta[name]) return;
            if (msg.type === "sync-request") {
                _broadcastSync(name);
                return;
            }
            const resolver = typeof sync === "object" ? sync.conflictResolver : null;
            const order = _compareSyncOrder(name, {
                clock: msg.clock,
                updatedAt: msg.updatedAt,
                source: msg.source,
            });
            if (order <= 0) {
                const localUpdated = new Date(_meta[name]?.updatedAt || 0).getTime();
                const incomingUpdated = msg.updatedAt;
                if (resolver) {
                    const resolved = resolver({
                        local: _stores[name],
                        incoming: msg.data,
                        localUpdated,
                        incomingUpdated,
                    });
                    if (resolved !== undefined) {
                        const schemaRes = _validateSchema(name, resolved);
                        if (!schemaRes.ok) return;
                        _stores[name] = resolved;
                        _meta[name].updatedAt = new Date(Math.max(localUpdated, incomingUpdated)).toISOString();
                        _meta[name].updateCount++;
                        _absorbSyncClock(name, typeof msg.clock === "number" ? msg.clock : 0);
                        _notify(name);
                    }
                }
                return;
            }
            const schemaRes = _validateSchema(name, msg.data);
            if (!schemaRes.ok) return;
            _stores[name] = msg.data;
            _meta[name].updatedAt = new Date(msg.updatedAt).toISOString();
            _meta[name].updateCount++;
            _absorbSyncClock(name, typeof msg.clock === "number" ? msg.clock : 0);
            _notify(name);
        };

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            _syncWindowCleanup[name]?.();
            const hostWindow = window;
            const requestLatest = () => {
                _requestSyncSnapshot(name);
            };
            hostWindow.addEventListener("focus", requestLatest);
            hostWindow.addEventListener("online", requestLatest);
            _syncWindowCleanup[name] = () => {
                hostWindow.removeEventListener("focus", requestLatest);
                hostWindow.removeEventListener("online", requestLatest);
            };
        }

        queueMicrotask(() => {
            _requestSyncSnapshot(name);
        });
    } catch (e) {
        warn(`Failed to setup sync for "${name}": ${(e as { message?: string })?.message || e}`);
    }
};

const _broadcastSync = (name: string): void => {
    const channel = _syncChannels[name];
    if (!channel) return;
    try {
        const sync = _meta[name]?.options?.sync;
        const payload = {
            type: "sync-state",
            source: INSTANCE_ID,
            name,
            clock: _syncClocks[name] ?? 0,
            updatedAt: Date.parse(_meta[name]?.updatedAt || new Date().toISOString()),
            data: _stores[name],
            checksum: hashState(_stores[name]),
        };
        const maxPayloadBytes = typeof sync === "object" && typeof sync.maxPayloadBytes === "number"
            ? sync.maxPayloadBytes
            : 64 * 1024;
        const payloadSize = _byteLength(JSON.stringify(payload));

        if (payloadSize > maxPayloadBytes) {
            _reportStoreError(
                name,
                `Sync payload for "${name}" exceeds ${maxPayloadBytes} bytes (${payloadSize} bytes). Skipping BroadcastChannel sync.`
            );
            return;
        }

        channel.postMessage(payload);
    } catch (err) {
        _reportStoreError(name, `Failed to broadcast sync for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
};

type SelectorDependency = string[];

const _trackSelectorDependencies = <TState, TResult>(
    state: TState,
    selectorFn: (state: TState) => TResult
): { result: TResult; deps: SelectorDependency[] } => {
    const seen = new WeakMap<object, unknown>();
    const deps = new Set<string>();
    const sep = "\u0000";

    const wrap = (value: unknown, path: string[]): unknown => {
        if (!value || typeof value !== "object") return value;
        const cached = seen.get(value as object);
        if (cached) return cached;

        const proxy = new Proxy(value as object, {
            get(target, prop, receiver) {
                if (typeof prop !== "string") {
                    return Reflect.get(target, prop, receiver);
                }
                const nextPath = [...path, prop];
                const result = Reflect.get(target, prop, receiver);
                if (!result || typeof result !== "object") {
                    deps.add(nextPath.join(sep));
                }
                return wrap(result, nextPath);
            },
        });

        seen.set(value as object, proxy);
        return proxy;
    };

    const result = selectorFn(wrap(state, []) as TState);
    return {
        result,
        deps: Array.from(deps, (entry) => entry.split(sep)),
    };
};

const _selectorDepsChanged = <TState>(prev: TState, next: TState, deps: SelectorDependency[]): boolean =>
    deps.some((path) => !Object.is(getByPath(prev, path), getByPath(next, path)));

// Selectors & presets
export const createSelector = <TState, TResult>(storeName: string, selectorFn: (state: TState) => TResult) => {
    let lastRef: TState | undefined;
    let lastResult: TResult | undefined;
    let lastDeps: SelectorDependency[] = [];
    return () => {
        const state = _stores[storeName] as TState | undefined;
        if (state === undefined) return null;
        if (state === lastRef) return lastResult ?? null;
        if (lastRef !== undefined && lastDeps.length > 0 && !_selectorDepsChanged(lastRef, state, lastDeps)) {
            lastRef = state;
            return lastResult ?? null;
        }
        const tracked = _trackSelectorDependencies(state, selectorFn);
        lastRef = state;
        lastDeps = tracked.deps;
        lastResult = tracked.result;
        return lastResult ?? null;
    };
};

export const subscribeWithSelector = <R>(
    name: string,
    selector: (state: any) => R,
    equality: (a: R, b: R) => boolean = Object.is,
    listener: (next: R, prev: R) => void
): (() => void) => {
    if (typeof selector !== "function" || typeof listener !== "function") {
        warn(`subscribeWithSelector("${name}") requires selector and listener functions.`);
        return () => {};
    }
    let prevSel: R = selector(_stores[name]);
    const wrapped = (_state: StoreValue | null) => {
        if (!_hasStoreEntry(name)) return;
        const nextSel = selector(_stores[name]);
        const matches = equality(nextSel, prevSel)
            || (
                equality === Object.is
                && nextSel !== null
                && prevSel !== null
                && typeof nextSel === "object"
                && typeof prevSel === "object"
                && hashState(nextSel) === hashState(prevSel)
            );
        if (!matches) {
            const last = prevSel;
            prevSel = nextSel;
            listener(deepClone(nextSel), deepClone(last));
        }
    };
    return _subscribe(name, wrapped);
};

export const createCounterStore = (name: string, initial = 0, options: StoreOptions = {}) => {
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStore(name, (draft: any) => { draft.value += n; }),
        dec: (n = 1) => setStore(name, (draft: any) => { draft.value -= n; }),
        set: (v: number) => setStore(name, "value", v),
        reset: () => resetStore(name),
        get: () => getStore(name, "value"),
    };
};

export const createListStore = <T>(name: string, initial: T[] = [], options: StoreOptions = {}) => {
    createStore(name, { items: initial }, options);
    return {
        push: (item: T) => setStore(name, (draft: any) => { draft.items.push(item); }),
        removeAt: (index: number) => setStore(name, (draft: any) => { draft.items.splice(index, 1); }),
        clear: () => setStore(name, { items: [] }),
        replace: (items: T[]) => setStore(name, { items }),
        all: () => getStore(name, "items") as T[],
    };
};

export const createEntityStore = <T extends { id?: string; _id?: string }>(name: string, options: StoreOptions = {}) => {
    createStore(name, { entities: {}, ids: [] as string[] }, options);
    return {
        upsert: (entity: T) => setStore(name, (draft: any) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && (crypto as any).randomUUID)
                    ? (crypto as any).randomUUID()
                    : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id: string) => setStore(name, (draft: any) => {
            draft.ids = draft.ids.filter((i: string) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const store = _stores[name] as any;
            if (!store) return [];
            return store.ids.map((id: string) => store.entities[id]) as T[];
        },
        get: (id: string) => getStore(name, ["entities", id]) as T | null,
        clear: () => resetStore(name),
    };
};

export const getInitialState = (): Record<string, StoreValue> => deepClone(_initial) as Record<string, StoreValue>;

export const getHistory = (name: string, limit?: number): HistoryEntry[] => {
    if (!_history[name]) return [];
    const entries = _history[name];
    if (limit && limit > 0) return deepClone(entries.slice(-limit));
    return deepClone(entries);
};

export const clearHistory = (name?: string): void => {
    if (name) {
        delete _history[name];
    } else {
        Object.keys(_history).forEach((n) => delete _history[n]);
    }
};

export const getMetrics = (name: string): MetaEntry["metrics"] | null => {
    const meta = _meta[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};

export const createStoreForRequest = (initializer?: (api: { create: (name: string, data: any, options?: StoreOptions) => any; set: (name: string, updater: any) => any; get: (name: string) => any }) => void) => {
    const buffer: Record<string, any> = {};
    const hasBuffered = (name: string): boolean => Object.prototype.hasOwnProperty.call(buffer, name);
    const api = {
        create: (name: string, data: any, options: StoreOptions = {}) => {
            buffer[name] = deepClone(data);
            return buffer[name];
        },
        set: (name: string, updater: any) => {
            if (!hasBuffered(name)) return;
            buffer[name] = typeof updater === "function" ? produceClone(buffer[name], updater) : updater;
            return buffer[name];
        },
        get: (name: string) => (hasBuffered(name) ? deepClone(buffer[name]) : undefined),
    };
    if (typeof initializer === "function") initializer(api);
    return {
        snapshot: () => deepClone(buffer),
        hydrate: (options: Record<string, StoreOptions> & { default?: StoreOptions } = {}) => hydrateStores(buffer, options),
    };
};

export const hydrateStores = (snapshot: Record<string, any>, options: Record<string, StoreOptions> & { default?: StoreOptions } = {}): void => {
    if (!snapshot || typeof snapshot !== "object") return;
    Object.entries(snapshot).forEach(([name, data]) => {
        if (hasStore(name)) {
            _replaceStoreState(name, data, "hydrate");
        } else {
            createStore(name, data, options[name] || options.default || {});
        }
    });
};

export const createZustandCompatStore = <T>(
    initializer: (set: (partial: Partial<T>, replace?: boolean) => void, get: () => T, api: any) => T,
    options: StoreOptions & { name?: string } = {}
) => {
    const name = options.name || `zstore_${Date.now()}`;

    const setState = (partial: Partial<T> | ((state: T) => Partial<T>), replace = false) => {
        const current = _stores[name] as T | undefined ?? {} as T;
        const nextPartial = typeof partial === "function" ? (partial as (s: T) => Partial<T>)(current) : partial;
        const next = replace ? nextPartial : { ...current, ...nextPartial };
        setStore(name, next as any);
    };

    const getState = () => _stores[name] as T;
    const api = {
        setState,
        getState,
        subscribe: (listener: Subscriber) => _subscribe(name, listener),
        subscribeWithSelector: (selector: (state: T) => any, equality = Object.is, listener?: (next: any, prev: any) => void) =>
            subscribeWithSelector(name, selector, equality, listener ?? (() => {})),
        destroy: () => deleteStore(name),
    };

    const initial = initializer(setState, getState, api);
    createStore(name, initial, options);
    return api;
};
