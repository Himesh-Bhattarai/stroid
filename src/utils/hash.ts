/**
 * @module utils/hash
 *
 * LAYER: Utilities
 * OWNS:  Module-level behavior and exports for utils/hash.
 *
 * Consumers: Internal imports and public API.
 */
import { FORBIDDEN_OBJECT_KEYS } from "./validation.js";

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


