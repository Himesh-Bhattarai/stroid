import type { PersistConfig, StoreValue } from "../../adapters/options.js";
import type { PersistMeta, PersistLoadArgs } from "./types.js";

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
}: PersistLoadArgs): boolean => {
    const meta: PersistMeta | undefined = getMeta();
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
        const safeUpdatedAt = Number.isFinite(restoredUpdatedAt) ? restoredUpdatedAt : Date.now();
        if (!Number.isFinite(restoredUpdatedAt)) {
            log(`persist: corrupt updatedAt in stored data for "${name}". Using current time to prevent sync overwrite.`);
        }
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
