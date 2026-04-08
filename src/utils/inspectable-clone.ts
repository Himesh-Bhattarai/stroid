/**
 * @module inspectable-clone
 *
 * LAYER: Utilities
 * OWNS:  Deep clone helper for runtime inspection payloads that may include functions.
 *
 * Consumers: runtime-tools and hydration report read-side projections.
 */
import { FORBIDDEN_OBJECT_KEYS } from "./validation.js";

export const cloneInspectable = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value as object)) return seen.get(value as object) as T;

    if (value instanceof Date) {
        const clone = new Date(value.getTime()) as T;
        seen.set(value as object, clone as unknown);
        return clone;
    }

    if (value instanceof RegExp) {
        const clone = new RegExp(value.source, value.flags) as T;
        seen.set(value as object, clone as unknown);
        return clone;
    }

    if (value instanceof Map) {
        const clone = new Map();
        seen.set(value as object, clone);
        value.forEach((entryValue, key) => {
            clone.set(
                cloneInspectable(key, seen),
                cloneInspectable(entryValue, seen)
            );
        });
        return clone as T;
    }

    if (value instanceof Set) {
        const clone = new Set();
        seen.set(value as object, clone);
        value.forEach((entryValue) => {
            clone.add(cloneInspectable(entryValue, seen));
        });
        return clone as T;
    }

    if (Array.isArray(value)) {
        const clone: unknown[] = [];
        seen.set(value as object, clone);
        value.forEach((entryValue, index) => {
            clone[index] = cloneInspectable(entryValue, seen);
        });
        return clone as T;
    }

    const source = value as Record<PropertyKey, unknown>;
    const clone = Object.create(Object.getPrototypeOf(source)) as Record<PropertyKey, unknown>;
    seen.set(source, clone);
    Reflect.ownKeys(source).forEach((key) => {
        if (typeof key === "string" && FORBIDDEN_OBJECT_KEYS.has(key)) return;
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (!descriptor?.enumerable) return;
        if ("get" in descriptor || "set" in descriptor) return;
        clone[key] = cloneInspectable(descriptor.value, seen);
    });
    return clone as T;
};
