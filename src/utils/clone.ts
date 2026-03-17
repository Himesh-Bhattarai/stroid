/**
 * @module utils/clone
 *
 * LAYER: Utilities
 * OWNS:  Module-level behavior and exports for utils/clone.
 *
 * Consumers: Internal imports and public API.
 */
import { warn } from "../internals/diagnostics.js";
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

const getNonCloneableReason = (value: unknown): string | null => {
    if (typeof value === "function") return "function";
    if (typeof value === "symbol") return "symbol";
    if (value === null || typeof value !== "object") return null;

    const checks: Array<[string, unknown]> = [
        ["WeakMap", (globalThis as any).WeakMap],
        ["WeakSet", (globalThis as any).WeakSet],
        ["WeakRef", (globalThis as any).WeakRef],
        ["Promise", (globalThis as any).Promise],
        ["ReadableStream", (globalThis as any).ReadableStream],
        ["WritableStream", (globalThis as any).WritableStream],
        ["TransformStream", (globalThis as any).TransformStream],
        ["EventTarget", (globalThis as any).EventTarget],
    ];

    for (const [label, ctor] of checks) {
        if (typeof ctor === "function" && value instanceof (ctor as any)) {
            return label;
        }
    }

    const NodeCtor = (globalThis as any).Node;
    if (typeof NodeCtor === "function" && value instanceof NodeCtor) {
        return "DOM Node";
    }

    return null;
};

const isStructuredCloneable = (value: unknown): boolean => getNonCloneableReason(value) === null;

const assertCloneable = (value: unknown): void => {
    const reason = getNonCloneableReason(value);
    if (!reason) return;
    throw new Error(
        `deepClone failed: value is not structured-cloneable (${reason}). ` +
        `Avoid storing this type in stroid state.`
    );
};

const _deepCloneFallback = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
    assertCloneable(value);
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
    let descriptors: Record<string, PropertyDescriptor>;
    try {
        descriptors = Object.getOwnPropertyDescriptors(value as Record<string, unknown>);
    } catch (err) {
        throw new Error(
            `deepClone failed to read object descriptors (possible Proxy or host object): ` +
            `${(err as { message?: string })?.message ?? err}`
        );
    }
    Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (!descriptor.enumerable || FORBIDDEN_OBJECT_KEYS.has(key)) return;
        if ("get" in descriptor || "set" in descriptor) return;
        clone[key] = _deepCloneFallback(descriptor.value, seen);
    });
    return clone as T;
};

export const deepClone = <T>(value: T): T => {
    if (hasStructuredClone) {
        try {
            return (structuredClone as <X>(v: X) => X)(value);
        } catch (err) {
            if (!isStructuredCloneable(value)) {
                const reason = getNonCloneableReason(value) ?? "unknown";
                throw new Error(
                    `deepClone failed: value is not structured-cloneable (${reason}). ` +
                    `Avoid storing this type in stroid state.`
                );
            }
            warn(
                `deepClone fell back to manual clone after structuredClone failed: ` +
                `${(err as { message?: string })?.message ?? err}`
            );
            return _deepCloneFallback(value);
        }
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


