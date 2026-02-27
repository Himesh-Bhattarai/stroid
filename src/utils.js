
export const isDev = () =>
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production";



export const warn = (msg) => {
    if (isDev()) console.warn(` [stroid] ${msg}`);
};

export const error = (msg) => {
    if (isDev()) console.error(` [stroid] ${msg}`);
};

export const log = (msg) => {
    if (isDev()) console.log(` [stroid] ${msg}`);
};

// --- hashing / checksum ------------------------------------------------------
const _crcTable = (() => {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export const crc32 = (str) => {
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 0);
        crc = (crc >>> 8) ^ _crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
};

export const hashState = (value) => {
    try {
        return crc32(JSON.stringify(value));
    } catch (_) {
        return crc32(String(value));
    }
};

// --- cloning / equality helpers ------------------------------------------------
const hasStructuredClone = typeof globalThis !== "undefined" && typeof globalThis.structuredClone === "function";

export const deepClone = (value) => {
    try {
        if (hasStructuredClone) return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        // fallback shallow copy for non-serializable cases
        if (Array.isArray(value)) return [...value];
        if (value && typeof value === "object") return { ...value };
        return value;
    }
};

export const shallowEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) return false;
    }
    return true;
};

export const produceClone = (base, recipe) => {
    const draft = deepClone(base);
    recipe(draft);
    return draft;
};

export const runSchemaValidation = (schema, value) => {
    if (!schema) return { ok: true };
    try {
        // zod: safeParse / parse
        if (typeof schema.safeParse === "function") {
            const res = schema.safeParse(value);
            return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error };
        }
        if (typeof schema.parse === "function") {
            schema.parse(value);
            return { ok: true, data: value };
        }
        // yup: validateSync / isValidSync
        if (typeof schema.validateSync === "function") {
            schema.validateSync(value);
            return { ok: true, data: value };
        }
        if (typeof schema.isValidSync === "function") {
            const valid = schema.isValidSync(value);
            return valid ? { ok: true, data: value } : { ok: false, error: "Schema validation failed" };
        }
        // JSON schema with ajv-like validate fn
        if (typeof schema.validate === "function") {
            const valid = schema.validate(value);
            return valid ? { ok: true, data: value } : { ok: false, error: schema.errors || "Schema validation failed" };
        }
        // function predicate
        if (typeof schema === "function") {
            const res = schema(value);
            if (res === false) return { ok: false, error: "Schema validation failed" };
            return { ok: true, data: res === true ? value : res };
        }
        return { ok: true, data: value };
    } catch (err) {
        return { ok: false, error: err?.message || err };
    }
};



const SUPPORTED_TYPES = [
    "object",
    "array",
    "string",
    "number",
    "boolean",
    "null",
];

export const getType = (value) => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (value instanceof Map) return "map";
    if (value instanceof Set) return "set";
    if (value instanceof Date) return "date";
    if (typeof value === "function") return "function";
    return typeof value;
};

export const isValidData = (value) => {
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



export const sanitize = (value) => {
    const type = getType(value);

    if (type === "date") return value.toISOString();
    if (type === "map") return Object.fromEntries(value);
    if (type === "set") return Array.from(value);
    if (type === "object") {
        const clean = {};
        for (const key in value) {
            clean[key] = sanitize(value[key]);
        }
        return clean;
    }
    if (type === "array") {
        return value.map(sanitize);
    }

    return value;
};




const MAX_DEPTH = 10;
const WARN_DEPTH = 5;

export const parsePath = (path) => {
    if (Array.isArray(path)) return path;
    if (typeof path === "string" && !path.includes(".")) return [path];
    if (typeof path === "string") return path.split(".");
    return [String(path)];
};

export const validateDepth = (path) => {
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

export const getByPath = (obj, path) => {
    const parts = parsePath(path);
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            warn(`Path "${parts.join(".")}" not found - reached null at "${part}"`);
            return undefined;
        }
        if (typeof current !== "object") {
            warn(`Cannot go deeper at "${part}" - value is not an object`);
            return undefined;
        }
        current = current[part];
    }

    return current;
};


export const setByPath = (obj, path, value) => {
    const parts = parsePath(path);

    if (parts.length === 1) {
        return { ...obj, [parts[0]]: value };
    }

    const [head, ...rest] = parts;
    const current = obj[head];

    return {
        ...obj,
        [head]: setByPath(
            typeof current === "object" && current !== null ? current : {},
            rest,
            value
        ),
    };
};


export const isValidStoreName = (name) => {
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



export const suggestStoreName = (name, existingNames) => {
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

const levenshtein = (a, b) => {
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
