/**
 * @module adapters/options/helpers
 *
 * LAYER: Module
 * OWNS:  Shared runtime helpers for options normalization.
 */
import type { PersistDriver } from "./types.js";

/**
 * Checks if a value is an object.
 *
 * This function checks if the value is of type 'object', is not null, and is not an array.
 *
 * @returns {boolean} True if the value is an object, false otherwise.
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const hasOwn = (value: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

export const isIdentityStringTransform = (fn: (v: string) => string): boolean => {
    try {
        const probeA = `__stroid_plaintext_probe_${Math.random().toString(36).slice(2)}__`;
        const probeB = `__stroid_plaintext_probe_${Math.random().toString(36).slice(2)}__`;
        if (fn(probeA) !== probeA) return false;
        return fn(probeB) === probeB;
    } catch (_) {
        return false;
    }
};

const DEFAULT_PERSIST_CRYPTO_MARK = typeof Symbol === "function"
    ? Symbol.for("stroid.persist.defaultCrypto")
    : "__stroid_persist_defaultCrypto__";

export const markDefaultPersistCrypto = (fn: (v: string) => string): ((v: string) => string) => {
    try {
        Reflect.set(fn as object, DEFAULT_PERSIST_CRYPTO_MARK, true);
    } catch (_) {
        // ignore marker failures
    }
    return fn;
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

/**
 * Returns a storage driver that attempts to use the given type of storage
 * (session or local) and falls back to memory storage if it is not available.
 *
 * @param {string} type The type of storage to attempt to use.
 * @returns {PersistDriver} A storage driver that may use memory storage if necessary.
 */
export const safeStorage = (type: string): PersistDriver => {
    try {
        if (typeof window === "undefined") return memoryStorage;
        if (type === "session" || type === "sessionStorage") return window.sessionStorage ?? memoryStorage;
        return window.localStorage ?? memoryStorage;
    } catch (_) {
        return memoryStorage;
    }
};
