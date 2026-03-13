import {
    warn,
    critical,
    sanitize,
    canReuseSanitized,
    parsePath,
    deepClone,
    runSchemaValidation,
    getType,
    type SupportedType,
    PathInput,
} from "../utils.js";
import { type ValidateOption } from "../adapters/options.js";
import {
    meta,
    stores,
    initialFactories,
    initialStates,
    setStoreValueInternal,
    getRegistry,
    setPathCacheInvalidator,
} from "./registry.js";
import { reportStoreError } from "./identity.js";
import {
    isTransactionActive,
    stageTransactionValue,
    registerTransactionCommit,
    getStagedTransactionValue,
} from "../store-transaction.js";
import type { StoreValue } from "./types.js";

type PathSafetyVerdict = { ok: true } | { ok: false; reason: string };
type PathValidationCacheNode = {
    children: Map<string, PathValidationCacheNode>;
    verdicts?: Map<SupportedType, PathSafetyVerdict>;
};
type PathValidationLruEntry = {
    node: PathValidationCacheNode;
    type: SupportedType;
};
const _pathValidationCacheByRegistry = new WeakMap<object, Map<string, PathValidationCacheNode>>();
const _pathValidationLruByRegistry = new WeakMap<object, Map<string, Map<string, PathValidationLruEntry>>>();
const MAX_PATH_CACHE_ENTRIES_PER_STORE = 500;
const PATH_CACHE_DELIMITER = "\u001f";
const getPathValidationCache = (registry: object): Map<string, PathValidationCacheNode> => {
    let cache = _pathValidationCacheByRegistry.get(registry);
    if (!cache) {
        cache = new Map();
        _pathValidationCacheByRegistry.set(registry, cache);
    }
    return cache;
};
const getPathValidationLru = (registry: object): Map<string, Map<string, PathValidationLruEntry>> => {
    let lru = _pathValidationLruByRegistry.get(registry);
    if (!lru) {
        lru = new Map();
        _pathValidationLruByRegistry.set(registry, lru);
    }
    return lru;
};
const getStorePathLru = (registry: object, storeName: string): Map<string, PathValidationLruEntry> => {
    const lruByStore = getPathValidationLru(registry);
    let storeLru = lruByStore.get(storeName);
    if (!storeLru) {
        storeLru = new Map();
        lruByStore.set(storeName, storeLru);
    }
    return storeLru;
};
const touchPathLru = (
    storeLru: Map<string, PathValidationLruEntry>,
    cacheKey: string,
    entry: PathValidationLruEntry
): void => {
    if (storeLru.has(cacheKey)) storeLru.delete(cacheKey);
    storeLru.set(cacheKey, entry);
    while (storeLru.size > MAX_PATH_CACHE_ENTRIES_PER_STORE) {
        const oldestKey = storeLru.keys().next().value as string | undefined;
        if (!oldestKey) break;
        const oldest = storeLru.get(oldestKey);
        storeLru.delete(oldestKey);
        if (oldest?.node.verdicts) {
            oldest.node.verdicts.delete(oldest.type);
            if (oldest.node.verdicts.size === 0) {
                delete oldest.node.verdicts;
            }
        }
    }
};

export const pathValidationCache = new Proxy(new Map(), {
    get: (_target, prop) => {
        const target = getPathValidationCache(getRegistry()) as any;
        if (prop === "size") return target.size;
        if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target);
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
    },
    set: (_target, prop, value) => {
        (getPathValidationCache(getRegistry()) as any)[prop] = value;
        return true;
    },
}) as Map<string, PathValidationCacheNode>;

export const resetPathValidationCache = (registry: object): void => {
    _pathValidationCacheByRegistry.set(registry, new Map<string, PathValidationCacheNode>());
    _pathValidationLruByRegistry.set(registry, new Map<string, Map<string, PathValidationLruEntry>>());
};

export const validatePathSafety = (storeName: string, base: StoreValue, path: PathInput, nextValue: unknown): { ok: boolean; reason?: string } => {
    const metaEntry = meta[storeName];
    if (!metaEntry) return { ok: true };
    const parts = parsePath(path);
    if (parts.length === 0) return { ok: true };
    const incomingType = getType(nextValue);
    const registry = getRegistry();
    const pathCache = getPathValidationCache(registry);
    const storeLru = getStorePathLru(registry, storeName);
    const pathKey = parts.join(PATH_CACHE_DELIMITER);
    let root = pathCache.get(storeName);
    if (!root) {
        root = { children: new Map() };
        pathCache.set(storeName, root);
    }

    let node = root;
    for (const segment of parts) {
        let child = node.children.get(segment);
        if (!child) {
            child = { children: new Map() };
            node.children.set(segment, child);
        }
        node = child;
    }

    const cached = node.verdicts?.get(incomingType);
    if (cached) {
        const cacheKey = `${pathKey}|${incomingType}`;
        touchPathLru(storeLru, cacheKey, { node, type: incomingType });
        return cached;
    }

    const allowCreate = metaEntry.options?.pathCreate === true;
    let cursor: unknown = base;
    let verdict: PathSafetyVerdict = { ok: true };
    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];
        const isLast = i === parts.length - 1;

        if (cursor === null || cursor === undefined) {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is ${cursor === null ? "null" : "undefined"}.`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }

        if (typeof cursor !== "object") {
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - "${parts.slice(0, i).join(".") || "root"}" is not an object.`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }

        if (Array.isArray(cursor)) {
            const idx = Number(key);
            if (!Number.isInteger(idx) || idx < 0) {
                const reason = `Path "${parts.join(".")}" targets non-numeric index "${key}" on an array in "${storeName}".`;
                critical(reason);
                verdict = { ok: false, reason };
                break;
            }

            const arr = cursor as unknown[];
            if (idx >= arr.length) {
                const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - index ${idx} is out of bounds (length ${arr.length}).`;
                critical(reason);
                verdict = { ok: false, reason };
                break;
            }

            if (isLast) {
                const existing = arr[idx];
                if (existing !== undefined && existing !== null) {
                    const expected = getType(existing);
                    if (expected !== incomingType) {
                        const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incomingType}.`;
                        critical(reason);
                        verdict = { ok: false, reason };
                        break;
                    }
                }
                verdict = { ok: true };
                break;
            }
            cursor = arr[idx];
            continue;
        }

        const hasKey = Object.prototype.hasOwnProperty.call(cursor as Record<string, unknown>, key);
        if (!hasKey) {
            if (allowCreate && isLast) {
                verdict = { ok: true };
                break;
            }
            const reason = `Path "${parts.join(".")}" is invalid for "${storeName}" - unknown key "${key}" at "${parts.slice(0, i).join(".") || "root"}".`;
            critical(reason);
            verdict = { ok: false, reason };
            break;
        }
        if (isLast) {
            const existing = (cursor as Record<string, unknown>)[key];
            if (existing !== undefined && existing !== null) {
                const expected = getType(existing);
                if (expected !== incomingType) {
                    const reason = `Type mismatch setting "${parts.join(".")}" on "${storeName}": expected ${expected}, received ${incomingType}.`;
                    critical(reason);
                    verdict = { ok: false, reason };
                    break;
                }
            }
            verdict = { ok: true };
            break;
        }
        cursor = (cursor as Record<string, unknown>)[key];
    }

    if (!node.verdicts) node.verdicts = new Map();
    const hadVerdict = node.verdicts.has(incomingType);
    node.verdicts.set(incomingType, verdict);
    if (!hadVerdict) {
        const cacheKey = `${pathKey}|${incomingType}`;
        touchPathLru(storeLru, cacheKey, { node, type: incomingType });
    }
    return verdict;
};

export const sanitizeValue = (
    name: string,
    value: unknown,
    onError?: (message: string) => void,
    options?: { reuseInput?: boolean }
): { ok: true; value: StoreValue } | { ok: false } => {
    try {
        if (options?.reuseInput && canReuseSanitized(value)) {
            return { ok: true, value: value as StoreValue };
        }
        return { ok: true, value: sanitize(value) as StoreValue };
    } catch (err) {
        const message = `Sanitize failed for "${name}": ${(err as { message?: string })?.message ?? err}`;
        meta[name]?.options?.onError?.(message);
        onError?.(message);
        warn(message);
        return { ok: false };
    }
};

const collectErrorHandlers = (name: string, onError?: (message: string) => void): Set<(message: string) => void> => {
    const handlers = new Set<((message: string) => void)>();
    const metaHandler = meta[name]?.options?.onError;
    if (typeof metaHandler === "function") handlers.add(metaHandler);
    if (typeof onError === "function") handlers.add(onError);
    return handlers;
};

export const runValidation = (
    name: string,
    value: StoreValue,
    validate: ValidateOption | undefined,
    onError?: (message: string) => void
): { ok: true; value: StoreValue } | { ok: false } => {
    if (!validate) return { ok: true, value };
    const handlers = collectErrorHandlers(name, onError);
    const report = (message: string, severity: "warn" | "critical"): void => {
        handlers.forEach((handler) => handler(message));
        if (severity === "critical") critical(message);
        else warn(message);
    };

    if (typeof validate === "function") {
        try {
            const result = validate(value);
            if (result === false) {
                report(`Validation blocked update for "${name}"`, "warn");
                return { ok: false };
            }
            return { ok: true, value: result === true ? value : result as StoreValue };
        } catch (err) {
            report(`Validation for "${name}" failed: ${(err as { message?: string })?.message ?? err}`, "critical");
            return { ok: false };
        }
    }

    const schemaResult = runSchemaValidation(validate, value);
    if (!schemaResult.ok) {
        report(`Validation failed for "${name}": ${schemaResult.error}`, "critical");
        return { ok: false };
    }
    return { ok: true, value: (schemaResult.data ?? value) as StoreValue };
};

export const normalizeCommittedState = (
    name: string,
    value: unknown,
    validate: ValidateOption | undefined,
    onError?: (message: string) => void,
    options?: { reuseInput?: boolean }
): { ok: true; value: StoreValue } | { ok: false } => {
    const sanitized = sanitizeValue(name, value, onError, options);
    if (!sanitized.ok) return { ok: false };

    const validation = runValidation(name, sanitized.value, validate, onError);
    if (!validation.ok) return { ok: false };

    return { ok: true, value: validation.value };
};

export const invalidatePathCache = (name: string): void => {
    const registry = getRegistry();
    getPathValidationCache(registry).delete(name);
    getPathValidationLru(registry).delete(name);
};

export const clearPathValidationCache = (): void => {
    const registry = getRegistry();
    getPathValidationCache(registry).clear();
    getPathValidationLru(registry).clear();
};

setPathCacheInvalidator(invalidatePathCache);

export const materializeInitial = (name: string): boolean => {
    const staged = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    if (staged.has) return true;
    if (stores[name] !== undefined) return true;
    const factory = initialFactories[name];
    if (!factory) return true;
    try {
        const produced = factory();
        const cleanResult = sanitizeValue(name, produced, meta[name]?.options?.onError);
        if (!cleanResult.ok) return false;
        const validate = meta[name]?.options?.validate;
        const normalized = normalizeCommittedState(name, cleanResult.value, validate, meta[name]?.options?.onError);
        if (!normalized.ok) return false;
        if (isTransactionActive()) {
            const value = normalized.value;
            stageTransactionValue(name, value);
            registerTransactionCommit(() => {
                setStoreValueInternal(name, value);
                initialStates[name] = deepClone(value);
                delete initialFactories[name];
            });
        } else {
            setStoreValueInternal(name, normalized.value);
            initialStates[name] = deepClone(normalized.value);
            delete initialFactories[name];
        }
        return true;
    } catch (err) {
        reportStoreError(name, `Lazy initializer for "${name}" failed: ${(err as { message?: string })?.message ?? err}`);
        return false;
    }
};
