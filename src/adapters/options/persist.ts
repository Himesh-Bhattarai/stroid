/**
 * @module adapters/options/persist
 *
 * LAYER: Module
 * OWNS:  Persist option normalization and validation.
 */
import { isIdentityStringTransform, markDefaultPersistCrypto, safeStorage } from "./helpers.js";
import type { PersistConfig, StoreOptions } from "./types.js";

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
