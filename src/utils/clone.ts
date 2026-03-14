import { warnAlways } from "../internals/diagnostics.js";
import { FORBIDDEN_OBJECT_KEYS } from "./validation.js";

// --- cloning / equality helpers ------------------------------------------------
const hasStructuredClone = typeof globalThis !== "undefined" && typeof (globalThis as any).structuredClone === "function";

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

    const WeakRefCtor = (globalThis as any)?.WeakRef as (new (...args: any[]) => any) | undefined;
    if (WeakRefCtor && value instanceof WeakRefCtor) {
        warnAlways("WeakRef values cannot be deep-cloned. Returning the original reference.");
        return value;
    }

    const clone: Record<string, unknown> = {};
    seen.set(value as object, clone);
    let descriptors: Record<string, PropertyDescriptor>;
    try {
        descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
    } catch (err) {
        warnAlways(
            `deepClone failed to read object descriptors (possible Proxy or host object). ` +
            `Returning the original reference.`
        );
        return value;
    }
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
