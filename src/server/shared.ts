/**
 * @module server/shared
 *
 * LAYER: SSR
 * OWNS:  Shared request-scope types and capture helpers.
 *
 * Consumers: Node SSR and explicit portable request-scope adapters.
 */
import type { StoreOptions } from "../adapters/options.js";
import type { StoreStateMap } from "../core/store-lifecycle/types.js";
import type { CarrierContext, StoreRegistry } from "../core/store-registry.js";
import { deepClone, produceClone } from "../utils.js";

type RequestStoreName<StateMap> =
    keyof StateMap extends never ? string : keyof StateMap & string;
type RequestStoreValue<StateMap, Name extends RequestStoreName<StateMap>> =
    Name extends keyof StateMap ? StateMap[Name] : unknown;

export type { RequestStoreName, RequestStoreValue };

export type RequestSnapshot<StateMap extends StoreStateMap = StoreStateMap> = Partial<{
    [K in RequestStoreName<StateMap>]: RequestStoreValue<StateMap, K>;
}>;

export type RequestScopeOptions<StateMap extends StoreStateMap = StoreStateMap> = Partial<{
    [K in RequestStoreName<StateMap>]: StoreOptions<RequestStoreValue<StateMap, K>>;
}>;

export type RequestHydrateOptions<StateMap extends StoreStateMap = StoreStateMap> =
    RequestScopeOptions<StateMap> & { default?: StoreOptions };

export type RequestScopeCapture<StateMap extends StoreStateMap = StoreStateMap> = {
    snapshot: RequestSnapshot<StateMap>;
    options: RequestScopeOptions<StateMap>;
};

export type RequestScopeOptionsInternal = Record<string, StoreOptions<any> | undefined>;

export type RequestStoreApi<StateMap extends StoreStateMap = StoreStateMap> = {
    create: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        data: RequestStoreValue<StateMap, Name>,
        options?: StoreOptions<RequestStoreValue<StateMap, Name>>
    ) => RequestStoreValue<StateMap, Name>;
    set: <Name extends RequestStoreName<StateMap>>(
        name: Name,
        updater: RequestStoreValue<StateMap, Name> | ((draft: RequestStoreValue<StateMap, Name>) => void)
    ) => RequestStoreValue<StateMap, Name>;
    get: <Name extends RequestStoreName<StateMap>>(
        name: Name
    ) => RequestStoreValue<StateMap, Name> | undefined;
    snapshot: () => RequestSnapshot<StateMap>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const cloneRequestOptionValue = (
    value: unknown,
    seen = new WeakMap<object, unknown>()
): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);

    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);
        value.forEach((entryValue, key) => {
            clone.set(
                cloneRequestOptionValue(key, seen),
                cloneRequestOptionValue(entryValue, seen),
            );
        });
        return clone;
    }
    if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);
        value.forEach((entryValue) => {
            clone.add(cloneRequestOptionValue(entryValue, seen));
        });
        return clone;
    }
    if (Array.isArray(value)) {
        const clone: unknown[] = [];
        seen.set(value, clone);
        value.forEach((entryValue, index) => {
            clone[index] = cloneRequestOptionValue(entryValue, seen);
        });
        return clone;
    }
    if (!isPlainObject(value)) {
        return value;
    }

    const clone: Record<string, unknown> = {};
    seen.set(value, clone);
    Object.entries(value).forEach(([key, entryValue]) => {
        clone[key] = cloneRequestOptionValue(entryValue, seen);
    });
    return clone;
};

export const cloneRequestStoreOptions = <State>(
    options?: StoreOptions<State>,
): StoreOptions<State> | undefined =>
    options
        ? cloneRequestOptionValue(options) as StoreOptions<State>
        : undefined;

const toPortableRequestStoreOptions = (
    options?: unknown
): StoreOptions<any> | undefined => {
    if (!options) return undefined;
    const normalized = options as StoreOptions<any> & {
        explicitPersist?: boolean;
        explicitSync?: boolean;
        explicitDevtools?: boolean;
        middleware?: Array<(ctx: unknown) => unknown>;
        historyLimit?: number;
        redactor?: ((state: unknown) => unknown) | undefined;
        devtools?: boolean;
        persist?: unknown;
        sync?: unknown;
        features?: unknown;
        migrations?: Record<number, (state: unknown) => unknown>;
        version?: number;
        snapshot?: "deep" | "shallow" | "ref";
        snapshotSafety?: "warn" | "throw" | "auto-clone";
    };

    const next: StoreOptions<any> = {};

    if (normalized.scope && normalized.scope !== "request") {
        next.scope = normalized.scope;
    }
    if (normalized.lazy === true) {
        next.lazy = true;
    }
    if (normalized.pathCreate === true) {
        next.pathCreate = true;
    }
    if (normalized.validate) {
        next.validate = normalized.validate;
    }
    if (normalized.onError) {
        next.onError = normalized.onError;
    }
    if (normalized.onCreate) {
        next.onCreate = normalized.onCreate;
    }
    if (normalized.onSet) {
        next.onSet = normalized.onSet;
    }
    if (normalized.onReset) {
        next.onReset = normalized.onReset;
    }
    if (normalized.onDelete) {
        next.onDelete = normalized.onDelete;
    }
    if (Array.isArray(normalized.middleware) && normalized.middleware.length > 0) {
        next.middleware = [...normalized.middleware];
    }
    if (normalized.features) {
        next.features = cloneRequestOptionValue(normalized.features) as StoreOptions["features"];
    }
    if (normalized.snapshot && normalized.snapshot !== "deep") {
        next.snapshot = normalized.snapshot;
    }
    if (normalized.snapshotSafety !== undefined) {
        next.snapshotSafety = normalized.snapshotSafety;
    }

    if (normalized.explicitPersist && normalized.persist) {
        next.persist = cloneRequestOptionValue({
            ...(normalized.persist as Record<string, unknown>),
            version: normalized.version,
            migrations: normalized.migrations,
        }) as StoreOptions["persist"];
    }

    if (normalized.explicitSync && normalized.sync !== false && normalized.sync !== undefined) {
        next.sync = cloneRequestOptionValue(normalized.sync) as StoreOptions["sync"];
    }

    if (normalized.explicitDevtools) {
        if (normalized.historyLimit !== undefined) {
            next.historyLimit = normalized.historyLimit;
        }
        if (normalized.redactor) {
            next.redactor = normalized.redactor;
        }
        next.devtools = normalized.devtools === false ? false : true;
    }

    return Object.keys(next).length > 0
        ? cloneRequestStoreOptions(next)
        : undefined;
};

export const cloneRequestScopeCapture = <StateMap extends StoreStateMap = StoreStateMap>(
    capture: RequestScopeCapture<StateMap>,
): RequestScopeCapture<StateMap> => {
    const clonedOptions: RequestScopeOptionsInternal = Object.create(null);
    Object.entries(capture.options as RequestScopeOptionsInternal).forEach(([name, options]) => {
        const cloned = cloneRequestStoreOptions(options);
        if (cloned !== undefined) {
            clonedOptions[name] = cloned;
        }
    });
    return {
        snapshot: deepClone(capture.snapshot) as RequestSnapshot<StateMap>,
        options: clonedOptions as RequestScopeOptions<StateMap>,
    };
};

export const captureRequestScopeFromRegistry = <StateMap extends StoreStateMap = StoreStateMap>(
    registry: StoreRegistry,
    carrier: CarrierContext | null = null,
): RequestScopeCapture<StateMap> => {
    const snapshot: RequestSnapshot<StateMap> = {};
    const options: RequestScopeOptionsInternal = Object.create(null);

    Object.keys(registry.metaEntries).forEach((name) => {
        const value = carrier && Object.prototype.hasOwnProperty.call(carrier, name)
            ? carrier[name]
            : registry.stores[name];
        snapshot[name as RequestStoreName<StateMap>] =
            deepClone(value) as RequestStoreValue<StateMap, RequestStoreName<StateMap>>;

        const storeOptions = toPortableRequestStoreOptions(registry.metaEntries[name]?.options);
        if (storeOptions !== undefined) {
            options[name] = storeOptions;
        }
    });

    return {
        snapshot,
        options: options as RequestScopeOptions<StateMap>,
    };
};

export const createBufferedRequestStoreApi = <StateMap extends StoreStateMap = StoreStateMap>(args: {
    buffer: RequestSnapshot<StateMap>;
    bufferedOptions: RequestScopeOptionsInternal;
}): RequestStoreApi<StateMap> => {
    const hasBuffered = (name: RequestStoreName<StateMap>): boolean =>
        Object.prototype.hasOwnProperty.call(args.buffer, name);

    return {
        create: (name, data, options = {}) => {
            args.buffer[name] = deepClone(data) as RequestStoreValue<StateMap, typeof name>;
            args.bufferedOptions[name] = cloneRequestStoreOptions(options) ?? {};
            return args.buffer[name] as RequestStoreValue<StateMap, typeof name>;
        },
        set: (name, updater) => {
            if (!hasBuffered(name)) {
                throw new Error(`createStoreForRequest.set("${name}") requires create("${name}", initialState) first.`);
            }
            args.buffer[name] = typeof updater === "function"
                ? produceClone(
                    args.buffer[name] as RequestStoreValue<StateMap, typeof name>,
                    updater as (draft: RequestStoreValue<StateMap, typeof name>) => void
                )
                : deepClone(updater) as RequestStoreValue<StateMap, typeof name>;
            return args.buffer[name] as RequestStoreValue<StateMap, typeof name>;
        },
        get: (name) => (hasBuffered(name)
            ? deepClone(args.buffer[name]) as RequestStoreValue<StateMap, typeof name>
            : undefined),
        snapshot: () => deepClone(args.buffer) as RequestSnapshot<StateMap>,
    };
};
