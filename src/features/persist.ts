import type { PersistConfig, StoreValue } from "../adapters/options.js";

export type PersistWatchEntry = { lastPresent: boolean; dispose: () => void };
export type PersistWatchState = Record<string, PersistWatchEntry>;
export type PersistTimers = Record<string, ReturnType<typeof setTimeout>>;

type PersistMeta = {
    version: number;
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
        return { state: persisted, requiresValidation: false };
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

export const persistSave = ({
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
}): void => {
    const cfg = getMeta()?.options?.persist;
    if (!cfg) return;
    if (persistTimers[name]) clearTimeout(persistTimers[name]);
    persistTimers[name] = setTimeout(() => {
        delete persistTimers[name];
        const meta = getMeta();
        if (!meta?.options?.persist || meta.options.persist !== cfg || !exists(name)) return;
        try {
            const serialized = cfg.serialize(getStoreValue());
            const checksum = hashState(serialized);
            const envelope = JSON.stringify({
                v: meta.version ?? 1,
                checksum,
                data: serialized,
            });
            const payload = cfg.encrypt(envelope);
            cfg.driver.setItem?.(cfg.key, payload);
            setPersistPresence(persistWatchState, name, true);
        } catch (e) {
            reportStoreError(name, `Could not persist store "${name}" (${(e as { message?: string })?.message || e})`);
        }
    }, 0);
};

export const persistLoad = ({
    name,
    silent = false,
    getMeta,
    getInitialState,
    setStoreValue,
    reportStoreError,
    validateSchema,
    log,
    hashState,
    deepClone,
    sanitize,
}: {
    name: string;
    silent?: boolean;
    getMeta: () => PersistMeta | undefined;
    getInitialState: () => StoreValue;
    setStoreValue: (value: StoreValue) => void;
    reportStoreError: (name: string, message: string) => void;
    validateSchema: (next: StoreValue) => { ok: boolean };
    log: (message: string) => void;
    hashState: (value: unknown) => number;
    deepClone: <T>(value: T) => T;
    sanitize: (value: unknown) => unknown;
}): boolean => {
    const meta = getMeta();
    const cfg = meta?.options?.persist;
    if (!cfg) return false;
    try {
        const raw = cfg.driver.getItem?.(cfg.key) ?? null;
        if (!raw) return false;
        const decrypted = cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data } = envelope || {};
        if (!data) return true;
        if (checksum !== hashState(data)) {
            reportStoreError(name, `Checksum mismatch loading store "${name}". Falling back to initial state.`);
            setStoreValue(deepClone(getInitialState()));
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
                    setStoreValue(parsed);
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
                    setStoreValue(parsed);
                    return true;
                }
                const recoveredSchema = validateSchema(parsed);
                if (!recoveredSchema.ok) {
                    setStoreValue(deepClone(getInitialState()));
                    return true;
                }
                setStoreValue(parsed);
                return true;
            }
        }

        const schemaResult = validateSchema(parsed);
        if (!schemaResult.ok) {
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
                    setStoreValue(fallback.state);
                    return true;
                }

                const recoveredSchema = validateSchema(fallback.state);
                if (recoveredSchema.ok) {
                    setStoreValue(fallback.state);
                    return true;
                }
            }
            reportStoreError(name, `Persisted state for "${name}" failed schema; resetting to initial.`);
            setStoreValue(deepClone(getInitialState()));
            return true;
        }

        setStoreValue(parsed);
        if (!silent) log(`Store "${name}" loaded from persistence`);
        return true;
    } catch (e) {
        reportStoreError(name, `Could not load store "${name}" (${(e as { message?: string })?.message || e})`);
        return true;
    }
};
