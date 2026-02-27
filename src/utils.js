
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
            `Store data only — handle functions outside the store.`
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
            warn(`Path "${parts.join(".")}" not found — reached null at "${part}"`);
            return undefined;
        }
        if (typeof current !== "object") {
            warn(`Cannot go deeper at "${part}" — value is not an object`);
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