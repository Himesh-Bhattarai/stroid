export {
    __DEV__,
    isDev,
    warn,
    warnAlways,
    error,
    log,
    critical,
    suggestStoreName,
} from "./internals/diagnostics.js";
import {
    error,
    getDateStoreWarningMessage,
    getDeepNestingWarningMessage,
    getInvalidFunctionStoreValueMessage,
    getInvalidStoreNameMessage,
    getForbiddenStoreNameMessage,
    getMapSetStoreWarningMessage,
    getPathDepthExceededMessage,
    getPathNotObjectMessage,
    getPathReachedNullMessage,
    getSanitizeDateWarningMessage,
    getSanitizeMapWarningMessage,
    getSanitizeSetWarningMessage,
    getStoreNameContainsSpacesMessage,
    isDev,
    critical,
    warn,
    warnAlways,
} from "./internals/diagnostics.js";

// --- hashing / checksum ------------------------------------------------------
let _crcTable: number[] | null = null;
const _getCrcTable = (): number[] => {
    if (_crcTable) return _crcTable;
    let c: number;
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c >>> 0;
    }
    _crcTable = table;
    return table;
};

export const crc32 = (str: string): number => {
    const table = _getCrcTable();
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 0);
        crc = (crc >>> 8) ^ table[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
};

type HashState = {
    h1: number;
    h2: number;
    seen: WeakMap<object, number>;
    nextId: number;
    nodes: number;
};

const HASH_SEED_1 = 0x811C9DC5;
const HASH_SEED_2 = 0x9E3779B1;
const MAX_HASH_NODES = 100_000;

const mixHash = (state: HashState, value: number): void => {
    const v = value >>> 0;
    state.h1 = Math.imul(state.h1 ^ v, 0x85EBCA6B);
    state.h2 = Math.imul(state.h2 ^ v, 0xC2B2AE35);
};

const mixString = (state: HashState, value: string): void => {
    mixHash(state, value.length);
    for (let i = 0; i < value.length; i++) {
        mixHash(state, value.charCodeAt(i));
    }
};

const mixToken = (state: HashState, token: string): void => {
    mixString(state, token);
};

const hashNumber = (state: HashState, value: number): void => {
    if (Number.isNaN(value)) {
        mixToken(state, "NaN");
        return;
    }
    if (!Number.isFinite(value)) {
        mixToken(state, value > 0 ? "Infinity" : "-Infinity");
        return;
    }
    if (Object.is(value, -0)) {
        mixToken(state, "-0");
        return;
    }
    const asInt = value | 0;
    if (value === asInt) {
        mixToken(state, "int");
        mixHash(state, asInt);
        return;
    }
    mixToken(state, "num");
    mixString(state, String(value));
};

const hashValue = (state: HashState, value: unknown): void => {
    if (state.nodes++ > MAX_HASH_NODES) {
        mixToken(state, "[max]");
        return;
    }
    if (value === null) {
        mixToken(state, "null");
        return;
    }
    const type = typeof value;
    if (type === "string") {
        mixToken(state, "string");
        mixString(state, value as string);
        return;
    }
    if (type === "number") {
        mixToken(state, "number");
        hashNumber(state, value as number);
        return;
    }
    if (type === "boolean") {
        mixToken(state, value ? "true" : "false");
        return;
    }
    if (type === "undefined") {
        mixToken(state, "undefined");
        return;
    }
    if (type === "bigint") {
        mixToken(state, "bigint");
        mixString(state, (value as bigint).toString());
        return;
    }
    if (type === "symbol") {
        mixToken(state, "symbol");
        const sym = value as symbol;
        mixString(state, Symbol.keyFor(sym) ?? sym.description ?? String(sym));
        return;
    }
    if (type === "function") {
        mixToken(state, "function");
        mixString(state, (value as Function).name || "anonymous");
        return;
    }

    const obj = value as object;
    const seenId = state.seen.get(obj);
    if (seenId !== undefined) {
        mixToken(state, "ref");
        mixHash(state, seenId);
        return;
    }
    const id = state.nextId++;
    state.seen.set(obj, id);

    if (Array.isArray(obj)) {
        mixToken(state, "array");
        mixHash(state, obj.length);
        for (let i = 0; i < obj.length; i++) {
            if (Object.prototype.hasOwnProperty.call(obj, i)) {
                hashValue(state, (obj as unknown[])[i]);
            } else {
                mixToken(state, "hole");
            }
        }
        return;
    }
    if (obj instanceof Date) {
        mixToken(state, "date");
        hashNumber(state, obj.getTime());
        return;
    }
    if (obj instanceof Map) {
        mixToken(state, "map");
        mixHash(state, obj.size);
        obj.forEach((entryValue, key) => {
            hashValue(state, key);
            hashValue(state, entryValue);
        });
        return;
    }
    if (obj instanceof Set) {
        mixToken(state, "set");
        mixHash(state, obj.size);
        obj.forEach((entryValue) => {
            hashValue(state, entryValue);
        });
        return;
    }

    mixToken(state, "object");
    const descriptors = Object.getOwnPropertyDescriptors(obj as Record<string, unknown>);
    const entries: Array<[string, PropertyDescriptor]> = [];
    Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (!descriptor?.enumerable) return;
        if (FORBIDDEN_OBJECT_KEYS.has(key)) return;
        if ("get" in descriptor || "set" in descriptor) return;
        entries.push([key, descriptor]);
    });
    mixHash(state, entries.length);
    for (const [key, descriptor] of entries) {
        mixString(state, key);
        hashValue(state, descriptor.value);
    }
};

/**
 * Non-cryptographic checksum for integrity (best-effort). Do not use for security.
 * String inputs preserve the legacy CRC32(JSON.stringify(value)) behavior to keep
 * persisted checksums stable across versions.
 */
export const hashState = (value: unknown): number => {
    if (typeof value === "string") {
        return crc32(JSON.stringify(value));
    }
    const state: HashState = {
        h1: HASH_SEED_1,
        h2: HASH_SEED_2,
        seen: new WeakMap(),
        nextId: 1,
        nodes: 0,
    };
    hashValue(state, value);
    let h1 = state.h1 >>> 0;
    let h2 = state.h2 >>> 0;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85EBCA6B);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xC2B2AE35);
    h1 ^= h1 >>> 16;
    h2 ^= h2 >>> 16;
    h2 = Math.imul(h2, 0x27D4EB2D);
    h2 ^= h2 >>> 15;
    h2 = Math.imul(h2, 0x165667B1);
    h2 ^= h2 >>> 16;
    return ((h1 & 0x1FFFFF) * 0x100000000) + (h2 >>> 0);
};

export const checksumState = hashState; // alias for clarity

// --- cloning / equality helpers ------------------------------------------------
const hasStructuredClone = typeof globalThis !== "undefined" && typeof (globalThis as any).structuredClone === "function";
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const shallowClone = <T>(value: T): T => {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (value instanceof Map) return new Map(value as Map<unknown, unknown>) as T;
    if (value instanceof Set) return new Set(value as Set<unknown>) as T;
    if (Array.isArray(value)) return (value.slice() as unknown) as T;

    const clone: Record<string, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
    Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (!descriptor.enumerable) return;
        if (FORBIDDEN_OBJECT_KEYS.has(key)) return;
        if ("get" in descriptor || "set" in descriptor) return;
        clone[key] = descriptor.value;
    });
    return clone as T;
};

const _deepCloneFallback = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value as object)) return seen.get(value as object) as T;

    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);
        value.forEach((entryValue, key) => {
            clone.set(_deepCloneFallback(key, seen), _deepCloneFallback(entryValue, seen));
        });
        return clone as T;
    }
    if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);
        value.forEach((entryValue) => {
            clone.add(_deepCloneFallback(entryValue, seen));
        });
        return clone as T;
    }
    if (Array.isArray(value)) {
        const clone: unknown[] = [];
        seen.set(value, clone);
        value.forEach((entry, index) => {
            clone[index] = _deepCloneFallback(entry, seen);
        });
        return clone as T;
    }

    const clone: Record<string, unknown> = {};
    seen.set(value as object, clone);
    const descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
    Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (!descriptor.enumerable || FORBIDDEN_OBJECT_KEYS.has(key)) return;
        if ("get" in descriptor || "set" in descriptor) return;
        clone[key] = _deepCloneFallback(descriptor.value, seen);
    });
    return clone as T;
};

export const deepClone = <T>(value: T): T => {
    try {
        if (hasStructuredClone) return (structuredClone as <X>(v: X) => X)(value);
    } catch (_) {
        // Fall through to the manual clone path below.
    }
    return _deepCloneFallback(value);
};

export const shallowEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(bObj, k) || !Object.is(aObj[k], bObj[k])) return false;
    }
    return true;
};

export const produceClone = <T>(base: T, recipe: (draft: T) => void): T => {
    try {
        const draft = deepClone(base);
        recipe(draft);
        return draft;
    } catch (err) {
        throw new Error(
            `produceClone failed (possible circular reference or unserializable data): ${(err as { message?: string })?.message ?? err}`
        );
    }
};

export const runSchemaValidation = (schema: unknown, value: unknown): { ok: boolean; data?: unknown; error?: unknown } => {
    if (!schema) return { ok: true };
    try {
        if (typeof (schema as { safeParse?: unknown }).safeParse === "function") {
            const res = (schema as any).safeParse(value);
            return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error };
        }
        if (typeof (schema as { parse?: unknown }).parse === "function") {
            (schema as any).parse(value);
            return { ok: true, data: value };
        }
        if (typeof (schema as { validateSync?: unknown }).validateSync === "function") {
            (schema as any).validateSync(value);
            return { ok: true, data: value };
        }
        if (typeof (schema as { isValidSync?: unknown }).isValidSync === "function") {
            const valid = (schema as any).isValidSync(value);
            return valid ? { ok: true, data: value } : { ok: false, error: "Schema validation failed" };
        }
        if (typeof (schema as { validate?: unknown }).validate === "function") {
            const res = (schema as any).validate(value);
            if (res === true) return { ok: true, data: value };
            if (res === false) return { ok: false, error: (schema as any).errors || "Schema validation failed" };
            if (res && typeof res === "object") {
                const joiError = (res as any).error;
                const message =
                    joiError?.details?.[0]?.message ||
                    joiError?.message ||
                    (res as any).message ||
                    (schema as any).errors;
                if (message) return { ok: false, error: message };
                if (joiError) return { ok: false, error: joiError };
            }
            const errMsg = (schema as any).errors || "Schema validation failed";
            return { ok: false, error: errMsg };
        }
        if (typeof schema === "function") {
            const res = (schema as (v: unknown) => unknown | boolean)(value);
            if (res === false) return { ok: false, error: "Schema validation failed" };
            return { ok: true, data: res === true ? value : res };
        }
        return { ok: true, data: value };
    } catch (err) {
        return { ok: false, error: (err as { message?: string })?.message ?? err };
    }
};

// --- type helpers ------------------------------------------------------------
const SUPPORTED_TYPES = [
    "object",
    "array",
    "string",
    "number",
    "boolean",
    "null",
] as const;
export type SupportedType = typeof SUPPORTED_TYPES[number] | "function" | "map" | "set" | "date" | "undefined" | "bigint" | "symbol";

export const getType = (value: unknown): SupportedType => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (value instanceof Map) return "map";
    if (value instanceof Set) return "set";
    if (value instanceof Date) return "date";
    if (typeof value === "function") return "function";
    return typeof value;
};

export const isValidData = (value: unknown): boolean => {
    const type = getType(value);
    if (type === "function") {
        error(getInvalidFunctionStoreValueMessage());
        return false;
    }
    if (type === "map" || type === "set") {
        warn(getMapSetStoreWarningMessage());
        return true;
    }
    if (type === "date") {
        warn(getDateStoreWarningMessage());
        return true;
    }
    return true;
};

const _canReuseSanitized = (value: unknown, seen: WeakSet<object>): boolean => {
    const type = getType(value);
    if (type === "number") {
        if (!Number.isFinite(value as number)) {
            throw new Error("Non-finite numbers are not supported");
        }
        return true;
    }
    if (type === "bigint") {
        throw new Error("BigInt values are not supported");
    }
    if (type === "symbol") {
        throw new Error("Symbol values are not supported");
    }
    if (type === "date" || type === "map" || type === "set") {
        return false;
    }
    if (type === "array") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        const keys = Object.keys(value as unknown[]);
        for (const key of keys) {
            const idx = Number(key);
            if (!Number.isInteger(idx)) return false;
        }
        for (let i = 0; i < (value as unknown[]).length; i += 1) {
            if (!(i in (value as unknown[]))) continue;
            if (!_canReuseSanitized((value as unknown[])[i], seen)) return false;
        }
        return true;
    }
    if (type === "object") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        if (Object.getOwnPropertySymbols(value as object).length > 0) return false;
        const descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (!descriptor.enumerable) return false;
            if (FORBIDDEN_OBJECT_KEYS.has(key)) return false;
            if ("get" in descriptor || "set" in descriptor) {
                throw new Error(`Accessor properties are not supported during sanitize ("${key}")`);
            }
            if (!_canReuseSanitized(descriptor.value, seen)) return false;
        }
        return true;
    }
    return true;
};

export const canReuseSanitized = (value: unknown): boolean => _canReuseSanitized(value, new WeakSet<object>());

const _sanitize = (value: unknown, seen: WeakSet<object>): unknown => {
    const type = getType(value);
    if (type === "number") {
        if (!Number.isFinite(value as number)) {
            throw new Error("Non-finite numbers are not supported");
        }
        return value;
    }
    if (type === "bigint") {
        throw new Error("BigInt values are not supported");
    }
    if (type === "symbol") {
        throw new Error("Symbol values are not supported");
    }
    if (type === "date") {
        if (isDev()) warn(getSanitizeDateWarningMessage());
        return (value as Date).toISOString();
    }
    if (type === "map") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        if (isDev()) warn(getSanitizeMapWarningMessage());
        const clean: Record<string, unknown> = {};
        for (const [key, entryValue] of value as Map<unknown, unknown>) {
            if (typeof key !== "string") {
                throw new Error("Map keys must be strings to remain JSON-safe");
            }
            clean[String(key)] = _sanitize(entryValue, seen);
        }
        return clean;
    }
    if (type === "set") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        if (isDev()) warn(getSanitizeSetWarningMessage());
        return Array.from(value as Set<unknown>, (entry) => _sanitize(entry, seen));
    }
    if (type === "object") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        const clean: Record<string, unknown> = {};
        const descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (!descriptor.enumerable) continue;
            if (FORBIDDEN_OBJECT_KEYS.has(key)) continue;
            if ("get" in descriptor || "set" in descriptor) {
                throw new Error(`Accessor properties are not supported during sanitize ("${key}")`);
            }
            clean[key] = _sanitize(descriptor.value, seen);
        }
        return clean;
    }
    if (type === "array") {
        if (seen.has(value as object)) {
            throw new Error("Circular reference detected during sanitize");
        }
        seen.add(value as object);
        return (value as unknown[]).map((entry) => _sanitize(entry, seen));
    }
    return value;
};

export const sanitize = (value: unknown): unknown => _sanitize(value, new WeakSet<object>());

const MAX_DEPTH = 10;
const WARN_DEPTH = 5;
export type PathInput = string | readonly string[] | string[];

const _splitPath = (path: string): string[] => {
    const parts: string[] = [];
    let current = "";
    let escaping = false;

    for (const ch of path) {
        if (escaping) {
            current += ch;
            escaping = false;
            continue;
        }
        if (ch === "\\") {
            escaping = true;
            continue;
        }
        if (ch === ".") {
            parts.push(current);
            current = "";
            continue;
        }
        current += ch;
    }

    if (escaping) current += "\\";
    parts.push(current);
    return parts;
};

export const parsePath = (path: PathInput): string[] => {
    if (Array.isArray(path)) return [...path] as string[];
    if (typeof path === "string" && !path.includes(".")) return [path];
    if (typeof path === "string") return _splitPath(path);
    return [String(path)];
};

export const validateDepth = (path: PathInput): boolean => {
    const parts = parsePath(path);
    const depth = parts.length;
    if (depth > MAX_DEPTH) {
        error(getPathDepthExceededMessage(depth, MAX_DEPTH, parts));
        return false;
    }
    if (depth > WARN_DEPTH) {
        warn(getDeepNestingWarningMessage(depth, parts));
    }
    return true;
};

export const getByPath = (obj: unknown, path: PathInput): unknown => {
    const parts = parsePath(path);
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined) {
            warn(getPathReachedNullMessage(parts, part));
            return undefined;
        }
        if (typeof current !== "object") {
            warn(getPathNotObjectMessage(part));
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
};

export const setByPath = <T extends Record<string, unknown> | unknown[]>(obj: T, path: PathInput, value: unknown): T => {
    const parts = parsePath(path);
    if (parts.length === 0) return obj;
    for (const segment of parts) {
        if (FORBIDDEN_OBJECT_KEYS.has(segment)) {
            critical(`Blocked forbidden path segment "${String(segment)}" in setStore path "${parts.join(".")}".`);
            return obj;
        }
    }

    const applyAt = (current: unknown, index: number): unknown => {
        const key = parts[index];
        const isLast = index === parts.length - 1;

        if (Array.isArray(current)) {
            const targetIndex = Number(key);
            if (!Number.isInteger(targetIndex)) return current;
            const clone = [...current];
            if (isLast) {
                clone[targetIndex] = value;
                return clone;
            }
            clone[targetIndex] = applyAt(clone[targetIndex], index + 1);
            return clone;
        }

        if (current && typeof current === "object") {
            if (FORBIDDEN_OBJECT_KEYS.has(key)) {
                critical(`Blocked unsafe path segment "${String(key)}" while setting "${parts.join(".")}".`);
                return current;
            }
            const clone: Record<string, unknown> = { ...(current as Record<string, unknown>) };
            if (isLast) {
                clone[key] = value;
                return clone as unknown;
            }
            clone[key] = applyAt(clone[key], index + 1);
            return clone as unknown;
        }

        if ((current === null || current === undefined) && !isLast) {
            const isIndex = Number.isInteger(Number(key));
            const container: Record<string, unknown> | unknown[] = isIndex ? [] : {};
            if (isIndex) {
                const arr = container as unknown[];
                const idx = Number(key);
                arr[idx] = applyAt(undefined, index + 1);
                return arr;
            }
            (container as Record<string, unknown>)[key] = applyAt(undefined, index + 1);
            return container;
        }

        // Fallback: leave unchanged when path cannot be extended.
        return isLast ? value : current;
    };

    return applyAt(obj, 0) as T;
};

export const isValidStoreName = (name: string): boolean => {
    if (typeof name !== "string" || name.trim() === "") {
        error(getInvalidStoreNameMessage(name));
        return false;
    }
    if (FORBIDDEN_OBJECT_KEYS.has(name)) {
        error(getForbiddenStoreNameMessage(name));
        return false;
    }
    if (name.includes(" ")) {
        error(getStoreNameContainsSpacesMessage(name));
        return false;
    }
    return true;
};
