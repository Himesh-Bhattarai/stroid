import type { PersistConfig, StoreValue } from "../../adapters/options.js";
import type { PersistMeta, PersistLoadArgs } from "./types.js";
import { normalizeFeatureState, resolveUpdatedAtMs } from "../state-helpers.js";
import { computePersistChecksum } from "./checksum.js";

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

    return { state: deepClone(initialState), requiresValidation: true };
};

export const persistLoad = (args: PersistLoadArgs): boolean | Promise<boolean> => {
    const meta: PersistMeta | undefined = args.getMeta();
    const cfg = meta?.options?.persist;
    if (!cfg) return false;
    const needsAsync = !!cfg.decryptAsync || cfg.checksum === "sha256";
    if (!needsAsync) {
        return persistLoadSync(args);
    }
    return persistLoadAsync(args);
};

const persistLoadSync = ({
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
    shouldApply,
}: PersistLoadArgs): boolean => {
    const meta: PersistMeta | undefined = getMeta();
    const cfg = meta?.options?.persist;
    if (!cfg) return false;
    const validateState = (candidate: StoreValue): { ok: boolean; value?: StoreValue } =>
        normalizeFeatureState({ value: candidate, validate });
    try {
        const raw = cfg.driver.getItem?.(cfg.key) ?? null;
        if (!raw) return false;
        if (typeof raw !== "string") {
            reportStoreError(
                name,
                `Persist driver for "${name}" returned an async value during sync hydration. ` +
                `Provide async decrypt hooks or use an async-capable persist driver.`
            );
            return true;
        }
        const decrypted = cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data, updatedAt, updatedAtMs } = envelope || {};
        if (!data) return true;
        const safeUpdatedAt = resolveUpdatedAtMs({
            value: typeof updatedAtMs === "number" ? updatedAtMs : updatedAt,
            fallbackMs: Date.now(),
            onInvalid: () => {
                log(`persist: corrupt updatedAt in stored data for "${name}". Using current time to prevent sync overwrite.`);
            },
        });
        if (cfg.checksum !== "none" && checksum !== hashState(data)) {
            reportStoreError(name, `Checksum mismatch loading store "${name}". Falling back to initial state.`);
            if (!shouldApply || shouldApply()) applyFeatureState(deepClone(getInitialState()), Date.now());
            return true;
        }
        let parsed = cfg.deserialize(data);
        const targetVersion = meta?.version ?? 1;
        const result = applyMigratedState({
            name,
            parsed,
            v,
            targetVersion,
            cfg,
            migrations: meta?.options?.migrations ?? {},
            getInitialState,
            reportStoreError,
            sanitize,
            deepClone,
            validateState,
            safeUpdatedAt,
            applyFeatureState,
            shouldApply,
        });
        if (!result.ok) return true;
        parsed = result.state;
        if (!shouldApply || shouldApply()) {
            applyFeatureState(result.state, safeUpdatedAt);
            if (!silent) log(`Store "${name}" loaded from persistence`);
        }
        return true;
    } catch (e) {
        reportStoreError(name, `Could not load store "${name}" (${(e as { message?: string })?.message || e})`);
        return true;
    }
};

const persistLoadAsync = async ({
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
    shouldApply,
}: PersistLoadArgs): Promise<boolean> => {
    const meta: PersistMeta | undefined = getMeta();
    const cfg = meta?.options?.persist;
    if (!cfg) return false;
    const validateState = (candidate: StoreValue): { ok: boolean; value?: StoreValue } =>
        normalizeFeatureState({ value: candidate, validate });
    try {
        const raw = await Promise.resolve(cfg.driver.getItem?.(cfg.key) ?? null);
        if (!raw) return false;
        const decrypted = cfg.decryptAsync
            ? await cfg.decryptAsync(raw)
            : cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data, updatedAt, updatedAtMs } = envelope || {};
        if (!data) return true;
        const safeUpdatedAt = resolveUpdatedAtMs({
            value: typeof updatedAtMs === "number" ? updatedAtMs : updatedAt,
            fallbackMs: Date.now(),
            onInvalid: () => {
                log(`persist: corrupt updatedAt in stored data for "${name}". Using current time to prevent sync overwrite.`);
            },
        });
        const computedChecksum = await computePersistChecksum(cfg.checksum, data, hashState);
        if (cfg.checksum !== "none" && checksum !== computedChecksum) {
            reportStoreError(name, `Checksum mismatch loading store "${name}". Falling back to initial state.`);
            if (!shouldApply || shouldApply()) applyFeatureState(deepClone(getInitialState()), Date.now());
            return true;
        }
        let parsed = cfg.deserialize(data);
        const targetVersion = meta?.version ?? 1;
        const result = applyMigratedState({
            name,
            parsed,
            v,
            targetVersion,
            cfg,
            migrations: meta?.options?.migrations ?? {},
            getInitialState,
            reportStoreError,
            sanitize,
            deepClone,
            validateState,
            safeUpdatedAt,
            applyFeatureState,
            shouldApply,
        });
        if (!result.ok) return true;
        if (!shouldApply || shouldApply()) {
            applyFeatureState(result.state, safeUpdatedAt);
            if (!silent) log(`Store "${name}" loaded from persistence`);
        }
        return true;
    } catch (e) {
        reportStoreError(name, `Could not load store "${name}" (${(e as { message?: string })?.message || e})`);
        return true;
    }
};

const applyMigratedState = ({
    name,
    parsed,
    v,
    targetVersion,
    cfg,
    migrations,
    getInitialState,
    reportStoreError,
    sanitize,
    deepClone,
    validateState,
    safeUpdatedAt,
    applyFeatureState,
    shouldApply,
}: {
    name: string;
    parsed: StoreValue;
    v: number;
    targetVersion: number;
    cfg: PersistConfig;
    migrations: Record<number, (state: any) => any>;
    getInitialState: () => StoreValue;
    reportStoreError: (name: string, message: string) => void;
    sanitize: (value: unknown) => unknown;
    deepClone: <T>(value: T) => T;
    validateState: (candidate: StoreValue) => { ok: boolean; value?: StoreValue };
    safeUpdatedAt: number;
    applyFeatureState: (value: StoreValue, updatedAtMs?: number) => void;
    shouldApply?: () => boolean;
}): { ok: boolean; state: StoreValue } => {
    if (v !== targetVersion) {
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
                if (!shouldApply || shouldApply()) applyFeatureState(parsed, safeUpdatedAt);
                return { ok: false, state: parsed };
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
                if (!shouldApply || shouldApply()) applyFeatureState(parsed, safeUpdatedAt);
                return { ok: false, state: parsed };
            }
            const recoveredValidation = validateState(parsed);
            if (!recoveredValidation.ok) {
                if (!shouldApply || shouldApply()) applyFeatureState(deepClone(getInitialState()), Date.now());
                return { ok: false, state: parsed };
            }
            return { ok: true, state: recoveredValidation.value ?? parsed };
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
                if (!shouldApply || shouldApply()) applyFeatureState(fallback.state, safeUpdatedAt);
                return { ok: false, state: fallback.state };
            }

            const recoveredValidation = validateState(fallback.state);
            if (recoveredValidation.ok) {
                return { ok: true, state: recoveredValidation.value ?? fallback.state };
            }
        }
        reportStoreError(name, `Persisted state for "${name}" failed schema; resetting to initial.`);
        if (!shouldApply || shouldApply()) applyFeatureState(deepClone(getInitialState()), Date.now());
        return { ok: false, state: parsed };
    }

    return { ok: true, state: validationResult.value ?? parsed };
};
