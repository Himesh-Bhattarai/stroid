import {
    critical,
    error,
    getDeepNestingWarningMessage,
    getPathDepthExceededMessage,
    getPathNotObjectMessage,
    getPathReachedNullMessage,
    warn,
} from "../internals/diagnostics.js";
import { FORBIDDEN_OBJECT_KEYS } from "./validation.js";

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
