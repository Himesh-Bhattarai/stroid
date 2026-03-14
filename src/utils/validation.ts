import {
    error,
    getDateStoreWarningMessage,
    getInvalidFunctionStoreValueMessage,
    getInvalidStoreNameMessage,
    getForbiddenStoreNameMessage,
    getMapSetStoreWarningMessage,
    getSanitizeDateWarningMessage,
    getSanitizeMapWarningMessage,
    getSanitizeSetWarningMessage,
    getStoreNameContainsSpacesMessage,
    isDev,
    warn,
} from "../internals/diagnostics.js";

export const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
