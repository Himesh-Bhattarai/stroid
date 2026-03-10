import { getConfig } from "./config.js";
const _envFromProcess = typeof process !== "undefined" && typeof process.env?.NODE_ENV === "string"
    ? process.env.NODE_ENV
    : undefined;
const _envFromImportMeta = typeof import.meta !== "undefined" && (import.meta as any)?.env?.MODE
    ? (import.meta as any).env.MODE
    : undefined;
const _devFlag = typeof globalThis !== "undefined" && typeof (globalThis as any).__STROID_DEV__ === "boolean"
    ? (globalThis as any).__STROID_DEV__
    : undefined;
const _fallbackEnv = "production";
const _resolvedEnv = _envFromProcess ?? _envFromImportMeta ?? _fallbackEnv;

export const __DEV__ = typeof _devFlag === "boolean"
    ? _devFlag
    : _resolvedEnv !== "production";

export const isDev = (): boolean => __DEV__;

const defaultWarn = (msg: string, meta?: Record<string, unknown>): void => {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        if (meta) console.warn(`[stroid] ${msg}`, meta);
        else console.warn(`[stroid] ${msg}`);
    }
};

const defaultCritical = (msg: string, meta?: Record<string, unknown>): void => {
    if (typeof console !== "undefined" && typeof console.error === "function") {
        if (meta) console.error(`[stroid] ${msg}`, meta);
        else console.error(`[stroid] ${msg}`);
    }
};

const defaultLog = (msg: string, meta?: Record<string, unknown>): void => {
    if (typeof console !== "undefined" && typeof console.log === "function") {
        if (meta) console.log(`[stroid] ${msg}`, meta);
        else console.log(`[stroid] ${msg}`);
    }
};

export const critical = (msg: string, meta?: Record<string, unknown>): void => {
    const sink = getConfig().logSink.critical ?? defaultCritical;
    sink(msg, meta);
};

export const warn = (msg: string, meta?: Record<string, unknown>): void => {
    if (!__DEV__) return;
    const sink = getConfig().logSink.warn ?? defaultWarn;
    sink(msg, meta);
};

export const error = (msg: string, meta?: Record<string, unknown>): void => {
    if (__DEV__) {
        const sink = getConfig().logSink.warn ?? defaultWarn;
        sink(msg, meta);
    }
    critical(msg, meta);
};

export const log = (msg: string, meta?: Record<string, unknown>): void => {
    if (!__DEV__) return;
    const sink = getConfig().logSink.warn ?? defaultLog;
    sink(msg, meta);
};

export const getInvalidFunctionStoreValueMessage = (): string =>
    `Functions cannot be stored in stroid.\n` +
    `Store data only - handle functions outside the store.`;

export const getMapSetStoreWarningMessage = (): string =>
    `Map/Set detected. stroid converts these to plain objects.\n` +
    `Use arrays or plain objects for best results.`;

export const getDateStoreWarningMessage = (): string =>
    `Date object detected. stroid stores it as ISO string.\n` +
    `Use new Date(value) to convert back when reading.`;

export const getSanitizeDateWarningMessage = (): string =>
    "Date detected; stored as ISO string. Use new Date(value) when reading.";

export const getSanitizeMapWarningMessage = (): string =>
    "Map detected; converting to plain object.";

export const getSanitizeSetWarningMessage = (): string =>
    "Set detected; converting to array.";

export const getPathDepthExceededMessage = (depth: number, maxDepth: number, parts: string[]): string =>
    `Path depth of ${depth} exceeded maximum of ${maxDepth}.\n` +
    `"${parts.join(".")}"\n` +
    `This is a data design issue. Split into separate stores:\n` +
    `createStore("${parts[0]}", ...) and createStore("${parts[1]}", ...)`;

export const getDeepNestingWarningMessage = (depth: number, parts: string[]): string =>
    `Deep nesting detected (${depth} levels): "${parts.join(".")}"\n` +
    `Consider splitting into separate stores for better readability.`;

export const getPathReachedNullMessage = (parts: string[], part: string): string =>
    `Path "${parts.join(".")}" not found - reached null at "${part}"`;

export const getPathNotObjectMessage = (part: string): string =>
    `Cannot go deeper at "${part}" - value is not an object`;

export const getInvalidStoreNameMessage = (name: string): string =>
    `Store name must be a non-empty string. Got: ${JSON.stringify(name)}`;

export const getStoreNameContainsSpacesMessage = (name: string): string =>
    `Store name "${name}" contains spaces.\n` +
    `Use camelCase or kebab-case: "userName" or "user-name"`;

const MAX_LEVENSHTEIN_INPUT_LENGTH = 128;

const shouldCheckLevenshtein = (a: string, b: string): boolean => {
    if (Math.abs(a.length - b.length) > 2) return false;
    return Math.max(a.length, b.length) <= MAX_LEVENSHTEIN_INPUT_LENGTH;
};

const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    let next = new Array<number>(a.length + 1);

    for (let i = 1; i <= b.length; i++) {
        next[0] = i;
        for (let j = 1; j <= a.length; j++) {
            next[j] =
                b[i - 1] === a[j - 1]
                    ? prev[j - 1]
                    : Math.min(prev[j - 1], next[j - 1], prev[j]) + 1;
        }
        [prev, next] = [next, prev];
    }
    return prev[a.length];
};

export const suggestStoreName = (name: string, existingNames: string[]): void => {
    const similar = existingNames.find((entry) => {
        const a = entry.toLowerCase();
        const b = name.toLowerCase();
        return (
            a.includes(b)
            || b.includes(a)
            || (shouldCheckLevenshtein(a, b) && levenshtein(a, b) <= 2)
        );
    });

    if (similar) {
        warn(`Store "${name}" not found. Did you mean "${similar}"?`);
        return;
    }

    error(
        `Store "${name}" not found.\n` +
        `Available stores: [${existingNames.join(", ")}]\n` +
        `Call createStore("${name}", data) first.`
    );
};
