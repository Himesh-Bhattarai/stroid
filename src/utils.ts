const _envFromProcess = typeof process !== "undefined" && typeof process.env?.NODE_ENV === "string"
    ? process.env.NODE_ENV
    : undefined;
const _envFromImportMeta = typeof import.meta !== "undefined" && (import.meta as any)?.env?.MODE
    ? (import.meta as any).env.MODE
    : undefined;
const _devFlag = typeof globalThis !== "undefined" && typeof (globalThis as any).__STROID_DEV__ === "boolean"
    ? (globalThis as any).__STROID_DEV__
    : undefined;

// Default to production when the environment is unknown to avoid leaking dev logs in bundled builds.
const _fallbackEnv = typeof process !== "undefined" ? "development" : "production";
const _resolvedEnv = _envFromProcess ?? _envFromImportMeta ?? _fallbackEnv;

export const __DEV__ = typeof _devFlag === "boolean"
    ? _devFlag
    : _resolvedEnv !== "production";

export const isDev = (): boolean => __DEV__;

export const warn: (msg: string) => void = __DEV__
    ? (msg: string) => { console.warn(`[stroid] ${msg}`); }
    : () => { };

export const error: (msg: string) => void = __DEV__
    ? (msg: string) => { console.error(`[stroid] ${msg}`); }
    : () => { };

export const log: (msg: string) => void = __DEV__
    ? (msg: string) => { console.log(`[stroid] ${msg}`); }
    : () => { };

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

export const hashState = (value: unknown): number => {
    try {
        return crc32(JSON.stringify(value));
    } catch (_) {
        return crc32(String(value));
    }
};

// --- cloning / equality helpers ------------------------------------------------
const hasStructuredClone = typeof globalThis !== "undefined" && typeof (globalThis as any).structuredClone === "function";

export const deepClone = <T>(value: T): T => {
    try {
        if (hasStructuredClone) return (structuredClone as <X>(v: X) => X)(value);
        return JSON.parse(JSON.stringify(value)) as T;
    } catch (_) {
        if (Array.isArray(value)) return [...value] as unknown as T;
        if (value && typeof value === "object") return { ...(value as Record<string, unknown>) } as T;
        return value;
    }
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
            const valid = (schema as any).validate(value);
            return valid ? { ok: true, data: value } : { ok: false, error: (schema as any).errors || "Schema validation failed" };
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
        error(
            `Functions cannot be stored in stroid.\n` +
            `Store data only - handle functions outside the store.`
        );
        return false;
    }
    if (type === "map" || type === "set") {
        warn(
            `Map/Set detected. stroid converts these to plain objects.\n` +
            `Use arrays or plain objects for best results.`
        );
        return true;
    }
    if (type === "date") {
        warn(
            `Date object detected. stroid stores it as ISO string.\n` +
            `Use new Date(value) to convert back when reading.`
        );
        return true;
    }
    return true;
};

export const sanitize = (value: unknown): unknown => {
    const type = getType(value);
    if (type === "date") {
        if (isDev()) warn("Date detected; stored as ISO string. Use new Date(value) when reading.");
        return (value as Date).toISOString();
    }
    if (type === "map") {
        if (isDev()) warn("Map detected; converting to plain object.");
        return Object.fromEntries(value as Map<unknown, unknown>);
    }
    if (type === "set") {
        if (isDev()) warn("Set detected; converting to array.");
        return Array.from(value as Set<unknown>);
    }
    if (type === "object") {
        const clean: Record<string, unknown> = {};
        for (const key in value as Record<string, unknown>) {
            clean[key] = sanitize((value as Record<string, unknown>)[key]);
        }
        return clean;
    }
    if (type === "array") {
        return (value as unknown[]).map(sanitize);
    }
    return value;
};

const MAX_DEPTH = 10;
const WARN_DEPTH = 5;
export type PathInput = string | readonly string[] | string[];

export const parsePath = (path: PathInput): string[] => {
    if (Array.isArray(path)) return [...path] as string[];
    if (typeof path === "string" && !path.includes(".")) return [path];
    if (typeof path === "string") return path.split(".");
    return [String(path)];
};

export const validateDepth = (path: PathInput): boolean => {
    const parts = parsePath(path);
    const depth = parts.length;
    if (depth > MAX_DEPTH) {
        error(
            `Path depth of ${depth} exceeded maximum of ${MAX_DEPTH}.\n` +
            `"${parts.join(".")}"\n` +
            `This is a data design issue. Split into separate stores:\n` +
            `createStore("${parts[0]}", ...) and createStore("${parts[1]}", ...)`
        );
        return false;
    }
    if (depth > WARN_DEPTH) {
        warn(
            `Deep nesting detected (${depth} levels): "${parts.join(".")}"\n` +
            `Consider splitting into separate stores for better readability.`
        );
    }
    return true;
};

export const getByPath = (obj: unknown, path: PathInput): unknown => {
    const parts = parsePath(path);
    let current: unknown = obj;
    for (const part of parts) {
        if (current === null || current === undefined) {
            warn(`Path "${parts.join(".")}" not found - reached null at "${part}"`);
            return undefined;
        }
        if (typeof current !== "object") {
            warn(`Cannot go deeper at "${part}" - value is not an object`);
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
};

export const setByPath = <T extends Record<string, unknown>>(obj: T, path: PathInput, value: unknown): T => {
    const parts = parsePath(path);
    if (parts.length === 1) {
        return { ...obj, [parts[0]]: value } as T;
    }
    const [head, ...rest] = parts;
    const current = obj[head];
    return {
        ...obj,
        [head]: setByPath(
            typeof current === "object" && current !== null ? (current as Record<string, unknown>) : {},
            rest,
            value
        ),
    } as T;
};

export const isValidStoreName = (name: string): boolean => {
    if (typeof name !== "string" || name.trim() === "") {
        error(`Store name must be a non-empty string. Got: ${JSON.stringify(name)}`);
        return false;
    }
    if (name.includes(" ")) {
        error(
            `Store name "${name}" contains spaces.\n` +
            `Use camelCase or kebab-case: "userName" or "user-name"`
        );
        return false;
    }
    return true;
};

export const suggestStoreName = (name: string, existingNames: string[]): void => {
    const similar = existingNames.find((n) => {
        const a = n.toLowerCase();
        const b = name.toLowerCase();
        return (
            a.includes(b) ||
            b.includes(a) ||
            levenshtein(a, b) <= 2
        );
    });
    if (similar) {
        warn(`Store "${name}" not found. Did you mean "${similar}"?`);
    } else {
        error(
            `Store "${name}" not found.\n` +
            `Available stores: [${existingNames.join(", ")}]\n` +
            `Call createStore("${name}", data) first.`
        );
    }
};

const levenshtein = (a: string, b: string): number => {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
        Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] =
                b[i - 1] === a[j - 1]
                    ? matrix[i - 1][j - 1]
                    : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
        }
    }
    return matrix[b.length][a.length];
};
