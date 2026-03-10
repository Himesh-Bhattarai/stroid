import type { PersistConfig, StoreValue } from "../adapters/options.js";
import { registerStoreFeature, type StoreFeatureRuntime } from "../feature-registry.js";

export type PersistWatchEntry = { lastPresent: boolean; dispose: () => void };
export type PersistWatchState = Record<string, PersistWatchEntry>;
export type PersistTimers = Record<string, ReturnType<typeof setTimeout>>;

let _registered = false;

type PersistMeta = {
    version: number;
    updatedAt: string;
    options: {
        persist: PersistConfig | null;
        migrations: Record<number, (state: any) => any>;
    };
};

const setPersistPresence = (
    persistWatchState: PersistWatchState,
    name: string,
    present: boolean
): void => {
    if (persistWatchState[name]) {
        persistWatchState[name].lastPresent = present;
    }
};

const resolveMigrationFailure = ({
    name,
    persisted,
    reason,
    persistConfig,
    initialState,
    reportStoreError,
    sanitize,
    deepClone,
}: {
    name: string;
    persisted: StoreValue;
    reason: string;
    persistConfig: PersistConfig | null | undefined;
    initialState: StoreValue;
    reportStoreError: (name: string, message: string) => void;
    sanitize: (value: unknown) => unknown;
    deepClone: <T>(value: T) => T;
}): { state: StoreValue; requiresValidation: boolean } => {
    reportStoreError(name, reason);

    const strategy = persistConfig?.onMigrationFail ?? "reset";
    if (strategy === "keep") {
        return { state: persisted, requiresValidation: true };
    }

    if (typeof strategy === "function") {
        try {
            const next = strategy(deepClone(persisted));
            if (next !== undefined) {
                return { state: sanitize(next) as StoreValue, requiresValidation: true };
            }
            reportStoreError(name, `onMigrationFail for "${name}" returned undefined. Falling back to initial state.`);
        } catch (err) {
            reportStoreError(name, `onMigrationFail for "${name}" failed: ${(err as { message?: string })?.message ?? err}`);
        }
    }

    return { state: deepClone(initialState), requiresValidation: false };
};

export const setupPersistWatch = ({
    name,
    persistConfig,
    persistWatchState,
}: {
    name: string;
    persistConfig: PersistConfig | null | undefined;
    persistWatchState: PersistWatchState;
}): void => {
    const callback = persistConfig?.onStorageCleared;
    if (!persistConfig || typeof callback !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function") return;

    persistWatchState[name]?.dispose();
    const hostWindow = window;

    const readPresent = (): boolean => {
        try {
            return persistConfig.driver.getItem?.(persistConfig.key) != null;
        } catch (_) {
            return false;
        }
    };

    const notifyIfCleared = (reason: "clear" | "remove" | "missing"): void => {
        const state = persistWatchState[name];
        const present = readPresent();
        if (!state) return;
        if (!state.lastPresent || present) {
            state.lastPresent = present;
            return;
        }
        state.lastPresent = false;
        callback({ name, key: persistConfig.key, reason });
    };

    const onStorage = (event: StorageEvent): void => {
        if (event.key === null) {
            notifyIfCleared("clear");
            return;
        }
        if (event.key === persistConfig.key && event.newValue === null) {
            notifyIfCleared("remove");
        }
    };

    const onFocus = (): void => {
        notifyIfCleared("missing");
    };

    hostWindow.addEventListener("storage", onStorage);
    hostWindow.addEventListener("focus", onFocus);

    persistWatchState[name] = {
        lastPresent: readPresent(),
        dispose: () => {
            hostWindow.removeEventListener("storage", onStorage);
            hostWindow.removeEventListener("focus", onFocus);
        },
    };
};

const persistSaveInner = ({
    name,
    persistTimers,
    persistWatchState,
    exists,
    getMeta,
    getStoreValue,
    reportStoreError,
    hashState,
}: {
    name: string;
    persistTimers: PersistTimers;
    persistWatchState: PersistWatchState;
    exists: (name: string) => boolean;
    getMeta: () => PersistMeta | undefined;
    getStoreValue: () => StoreValue;
    reportStoreError: (name: string, message: string) => void;
    hashState: (value: unknown) => number;
}, immediate = false): void => {
    const cfg = getMeta()?.options?.persist;
    if (!cfg) return;
    if (persistTimers[name]) clearTimeout(persistTimers[name]);

    const writeNow = () => {
        delete persistTimers[name];
        const meta = getMeta();
        if (!meta?.options?.persist || meta.options.persist !== cfg || !exists(name)) return;
        try {
            const serialized = cfg.serialize(getStoreValue());
            const checksum = hashState(serialized);
            const envelope = JSON.stringify({
                v: meta.version ?? 1,
                updatedAt: meta.updatedAt,
                checksum,
                data: serialized,
            });
            const payload = cfg.encrypt(envelope);
            cfg.driver.setItem?.(cfg.key, payload);
            setPersistPresence(persistWatchState, name, true);
        } catch (e) {
            reportStoreError(name, `Could not persist store "${name}" (${(e as { message?: string })?.message || e})`);
        }
    };

    if (immediate) {
        writeNow();
        return;
    }

    if (typeof queueMicrotask === "function") {
        persistTimers[name] = setTimeout(() => writeNow(), 0); // fallback timer in case microtask not available
        queueMicrotask(writeNow);
    } else {
        persistTimers[name] = setTimeout(writeNow, 0);
    }
};

export const persistLoad = ({
    name,
    silent = false,
    getMeta,
    getInitialState,
    applyFeatureState,
    reportStoreError,
    validate,
    log,
    hashState,
    deepClone,
    sanitize,
}: {
    name: string;
    silent?: boolean;
    getMeta: () => PersistMeta | undefined;
        getInitialState: () => StoreValue;
        applyFeatureState: (value: StoreValue, updatedAtMs?: number) => void;
        reportStoreError: (name: string, message: string) => void;
        validate: (next: StoreValue) => { ok: boolean; value?: StoreValue };
        log: (message: string) => void;
    hashState: (value: unknown) => number;
    deepClone: <T>(value: T) => T;
    sanitize: (value: unknown) => unknown;
}): boolean => {
    const meta = getMeta();
    const cfg = meta?.options?.persist;
    if (!cfg) return false;
    const validateState = (candidate: StoreValue): { ok: boolean; value?: StoreValue } => {
        const res = validate(candidate);
        if (!res.ok) return { ok: false };
        return { ok: true, value: res.value ?? candidate };
    };
    try {
        const raw = cfg.driver.getItem?.(cfg.key) ?? null;
        if (!raw) return false;
        const decrypted = cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data, updatedAt } = envelope || {};
        if (!data) return true;
        const restoredUpdatedAt =
            typeof updatedAt === "string" || typeof updatedAt === "number"
                ? Date.parse(String(updatedAt))
                : Number.NaN;
        const safeUpdatedAt = Number.isFinite(restoredUpdatedAt) ? restoredUpdatedAt : 0;
        if (checksum !== hashState(data)) {
            reportStoreError(name, `Checksum mismatch loading store "${name}". Falling back to initial state.`);
            applyFeatureState(deepClone(getInitialState()), Date.now());
            return true;
        }
        let parsed = cfg.deserialize(data);
        const targetVersion = meta?.version ?? 1;
        if (v !== targetVersion) {
            const migrations = meta?.options?.migrations || {};
            const steps = Object.keys(migrations)
                .map((k) => Number(k))
                .filter((ver) => ver > v && ver <= targetVersion)
                .sort((a, b) => a - b);

            if (steps.length === 0) {
                const fallback = resolveMigrationFailure({
                    name,
                    persisted: parsed,
                    reason: `No migration path from v${v} to v${targetVersion} for "${name}". Applying onMigrationFail strategy.`,
                    persistConfig: cfg,
                    initialState: getInitialState(),
                    reportStoreError,
                    sanitize,
                    deepClone,
                });
                parsed = fallback.state;
                if (!fallback.requiresValidation) {
                    applyFeatureState(parsed, safeUpdatedAt);
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
                    const fallback = resolveMigrationFailure({
                        name,
                        persisted: parsed,
                        reason: `Migration to v${ver} failed for "${name}": ${(e as { message?: string })?.message || e}`,
                        persistConfig: cfg,
                        initialState: getInitialState(),
                        reportStoreError,
                        sanitize,
                        deepClone,
                    });
                    parsed = fallback.state;
                    migrationFailureRequiresValidation = fallback.requiresValidation;
                    migrationFailed = true;
                }
            });

            if (migrationFailed) {
                if (!migrationFailureRequiresValidation) {
                    applyFeatureState(parsed, safeUpdatedAt);
                    return true;
                }
                const recoveredValidation = validateState(parsed);
                if (!recoveredValidation.ok) {
                    applyFeatureState(deepClone(getInitialState()), Date.now());
                    return true;
                }
                applyFeatureState(recoveredValidation.value ?? parsed, safeUpdatedAt);
                return true;
            }
        }

        const validationResult = validateState(parsed);
        if (!validationResult.ok) {
            if (v !== targetVersion) {
                const fallback = resolveMigrationFailure({
                    name,
                    persisted: parsed,
                    reason: `Persisted state for "${name}" failed schema after version change. Applying onMigrationFail strategy.`,
                    persistConfig: cfg,
                    initialState: getInitialState(),
                    reportStoreError,
                    sanitize,
                    deepClone,
                });
                if (!fallback.requiresValidation) {
                    applyFeatureState(fallback.state, safeUpdatedAt);
                    return true;
                }

                const recoveredValidation = validateState(fallback.state);
                if (recoveredValidation.ok) {
                    applyFeatureState(recoveredValidation.value ?? fallback.state, safeUpdatedAt);
                    return true;
                }
            }
            reportStoreError(name, `Persisted state for "${name}" failed schema; resetting to initial.`);
            applyFeatureState(deepClone(getInitialState()), Date.now());
            return true;
        }

        applyFeatureState(validationResult.value ?? parsed, safeUpdatedAt);
        if (!silent) log(`Store "${name}" loaded from persistence`);
        return true;
    } catch (e) {
        reportStoreError(name, `Could not load store "${name}" (${(e as { message?: string })?.message || e})`);
        return true;
    }
};

export const persistSave = (args: {
    name: string;
    persistTimers: PersistTimers;
    persistWatchState: PersistWatchState;
    exists: (name: string) => boolean;
    getMeta: () => PersistMeta | undefined;
    getStoreValue: () => StoreValue;
    reportStoreError: (name: string, message: string) => void;
    hashState: (value: unknown) => number;
}): void => persistSaveInner(args);

export const flushPersistImmediately = (name: string, args: {
    persistTimers: PersistTimers;
    persistWatchState: PersistWatchState;
    exists: (name: string) => boolean;
    getMeta: () => PersistMeta | undefined;
    getStoreValue: () => StoreValue;
    reportStoreError: (name: string, message: string) => void;
    hashState: (value: unknown) => number;
}): void => persistSaveInner({ ...args, name }, true);

export const createPersistFeatureRuntime = (): StoreFeatureRuntime => {
    const persistTimers: PersistTimers = {};
    const persistKeys: Record<string, string> = Object.create(null);
    const persistWatchState: PersistWatchState = Object.create(null);

    return {
        onStoreCreate(ctx) {
            const cfg = ctx.options.persist;
            if (!cfg) return;

            const isIdentity = (fn: (v: string) => string): boolean => {
                try {
                    const probe = "__stroid_plaintext_probe__";
                    return fn(probe) === probe;
                } catch (_) {
                    const src = fn.toString().replace(/\s/g, "");
                    return src === "v=>v" || src === "(v)=>v" || src === "function(v){returnv;}";
                }
            };

            if (typeof cfg.encrypt === "function" && isIdentity(cfg.encrypt)) {
                ctx.warn(`persist: encrypt is identity function — data for "${ctx.name}" stored as plaintext.`);
            }

            if ((cfg as any).sensitiveData && !cfg.encrypt) {
                ctx.reportStoreError(`persist: store "${ctx.name}" marked sensitiveData but has no encryption configured.`);
            }

            if (cfg.key) {
                const existing = persistKeys[cfg.key];
                if (existing && existing !== ctx.name && ctx.isDev()) {
                    ctx.warn(
                        `Persist key collision: "${cfg.key}" already used by store "${existing}". ` +
                        `Store "${ctx.name}" will overwrite the same storage key.`,
                    );
                } else {
                    persistKeys[cfg.key] = ctx.name;
                }
            }

            const hadPersistedState = persistLoad({
                name: ctx.name,
                silent: true,
                getMeta: ctx.getMeta,
                getInitialState: ctx.getInitialState,
                applyFeatureState: ctx.applyFeatureState,
                reportStoreError: (name, message) => ctx.reportStoreError(message),
                validate: ctx.validate,
                log: ctx.log,
                hashState: ctx.hashState,
                deepClone: ctx.deepClone,
                sanitize: ctx.sanitize,
            });

            if (!hadPersistedState) {
                persistSave({
                    name: ctx.name,
                    persistTimers,
                    persistWatchState,
                    exists: () => ctx.hasStore(),
                    getMeta: ctx.getMeta,
                    getStoreValue: ctx.getStoreValue,
                    reportStoreError: (name, message) => ctx.reportStoreError(message),
                    hashState: ctx.hashState,
                });
            }

            if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
                const flush = () => {
                    flushPersistImmediately(ctx.name, {
                        persistTimers,
                        persistWatchState,
                        exists: () => ctx.hasStore(),
                        getMeta: ctx.getMeta,
                        getStoreValue: ctx.getStoreValue,
                        reportStoreError: (name, message) => ctx.reportStoreError(message),
                        hashState: ctx.hashState,
                    });
                };
                window.addEventListener("pagehide", flush, { once: true });
                window.addEventListener("beforeunload", flush, { once: true });
            }

            setupPersistWatch({
                name: ctx.name,
                persistConfig: cfg,
                persistWatchState,
            });
        },

        onStoreWrite(ctx) {
            if (!ctx.options.persist) return;
            persistSave({
                name: ctx.name,
                persistTimers,
                persistWatchState,
                exists: () => ctx.hasStore(),
                getMeta: ctx.getMeta,
                getStoreValue: ctx.getStoreValue,
                reportStoreError: (name, message) => ctx.reportStoreError(message),
                hashState: ctx.hashState,
            });
        },

        beforeStoreDelete(ctx) {
            const cfg = ctx.options.persist;
            if (!cfg) return;

            if (persistTimers[ctx.name]) {
                clearTimeout(persistTimers[ctx.name]);
                delete persistTimers[ctx.name];
            }

            try {
                cfg.driver.removeItem?.(cfg.key);
            } catch (_) {
                // ignore driver cleanup errors
            }

            if (cfg.key && persistKeys[cfg.key] === ctx.name) {
                delete persistKeys[cfg.key];
            }

            persistWatchState[ctx.name]?.dispose();
            delete persistWatchState[ctx.name];
        },

        resetAll() {
            Object.values(persistTimers).forEach((timer) => clearTimeout(timer));
            Object.values(persistWatchState).forEach((entry) => {
                try { entry.dispose(); } catch (_) { /* ignore cleanup errors */ }
            });

            Object.keys(persistTimers).forEach((key) => delete persistTimers[key]);
            Object.keys(persistKeys).forEach((key) => delete persistKeys[key]);
            Object.keys(persistWatchState).forEach((key) => delete persistWatchState[key]);
        },
    };
};

export const registerPersistFeature = (): void => {
    if (_registered) return;
    _registered = true;
    registerStoreFeature("persist", createPersistFeatureRuntime);
};
