import type { PersistOptions } from "../adapters/options.js";
import { registerStoreFeature, type StoreFeatureRuntime } from "../feature-registry.js";
import { isIdentityCrypto, validateCryptoPair } from "./persist/crypto.js";
import { setupPersistWatch } from "./persist/watch.js";
import { persistLoad } from "./persist/load.js";
import { persistSave, flushPersistImmediately } from "./persist/save.js";
import type {
    PersistWatchEntry,
    PersistWatchState,
    PersistTimers,
    PersistInFlight,
    PersistMeta,
} from "./persist/types.js";

export type { PersistWatchEntry, PersistWatchState, PersistTimers } from "./persist/types.js";
export { setupPersistWatch } from "./persist/watch.js";
export { persistLoad } from "./persist/load.js";
export { persistSave, flushPersistImmediately } from "./persist/save.js";

let _registered = false;
const _envFromProcess = typeof process !== "undefined" && typeof process.env?.NODE_ENV === "string"
    ? process.env.NODE_ENV
    : undefined;
const _envFromImportMeta = typeof import.meta !== "undefined" && (import.meta as any)?.env?.MODE
    ? (import.meta as any).env.MODE
    : undefined;
const _resolvedEnv = _envFromProcess ?? _envFromImportMeta;
const isProdEnv = (): boolean => _resolvedEnv === "production";

export const createPersistFeatureRuntime = (): StoreFeatureRuntime => {
    const persistTimers: PersistTimers = {};
    const persistInFlight: PersistInFlight = {};
    const persistKeys: Record<string, string> = Object.create(null);
    const persistWatchState: PersistWatchState = Object.create(null);
    const plaintextWarningsIssued = new Set<string>();

    return {
        api: {
            getPersistQueueDepth(name: string) {
                return persistTimers[name] ? 1 : 0;
            },
        },

        onStoreCreate(ctx) {
            const cfg = ctx.options.persist;
            if (!cfg) return;

            const isPlaintext = isIdentityCrypto(cfg.encrypt) && isIdentityCrypto(cfg.decrypt);
            if (isPlaintext && !cfg.allowPlaintext) {
                const message =
                    `[stroid/persist] Store "${ctx.name}" is configured for plaintext persistence. ` +
                    `Provide encrypt/decrypt hooks or set persist.allowPlaintext: true to acknowledge.`;
                if (isProdEnv()) {
                    ctx.reportStoreError(message);
                    ctx.options.persist = null;
                    return;
                }
                ctx.warn(message);
            }
            if ((cfg as PersistOptions & { sensitiveData?: boolean }).sensitiveData && !cfg.encrypt) {
                ctx.reportStoreError(
                    `persist: store "${ctx.name}" is marked sensitiveData but has no encrypt function. ` +
                    `Plaintext data will be written to storage.`
                );
                return; // block registration — do not persist without encryption on sensitive stores
            }

            const cryptoValidation = validateCryptoPair(ctx.name, cfg.encrypt, cfg.decrypt);
            if (!cryptoValidation.ok) {
                ctx.reportStoreError(cryptoValidation.reason ?? `persist: encrypt/decrypt validation failed for store "${ctx.name}".`);
                ctx.options.persist = null;
                return; // block registration — do not persist when crypto hooks are misconfigured
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
                    persistInFlight,
                    persistWatchState,
                    plaintextWarningsIssued,
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
                        persistInFlight,
                        persistWatchState,
                        plaintextWarningsIssued,
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
                persistInFlight,
                persistWatchState,
                plaintextWarningsIssued,
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
            persistInFlight[ctx.name] = null;

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
            Object.keys(persistInFlight).forEach((key) => { persistInFlight[key] = null; delete persistInFlight[key]; });
            Object.keys(persistKeys).forEach((key) => delete persistKeys[key]);
            Object.keys(persistWatchState).forEach((key) => delete persistWatchState[key]);
            plaintextWarningsIssued.clear();
        },
    };
};

export const registerPersistFeature = (): void => {
    if (_registered) return;
    _registered = true;
    registerStoreFeature("persist", createPersistFeatureRuntime);
};
