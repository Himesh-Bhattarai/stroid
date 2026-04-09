/**
 * @module store-name
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-name.
 *
 * Consumers: Internal imports and public API.
 */
import type { StoreKey, StoreValue } from "./store-lifecycle/types.js";
import type { StoreOptions } from "../adapters/options.js";
import { createStore, createStoreStrict } from "./store-create.js";
import { setStoreWithContext, deleteStore, resetStore } from "./store-write.js";
import { getStore } from "./store-read.js";
import type { NonFunction } from "../types/utility.js";

/**
 * Helper to get an auto-completable, literal-typed store handle without creating it.
 *
 * Example:
 *   const user = store("user");
 *   setStore(user, "name", "Alex");
 */
export const store = <Name extends string, State = StoreValue>(name: Name): StoreKey<Name, State> =>
    ({ name } as StoreKey<Name, State>);

export const namespace = (ns: string) => {
    const prefix = `${ns}::`;
    const qualify = (name: string) => (name.includes("::") ? name : `${prefix}${name}`);

    type NamespaceHandle = StoreKey<string, Record<string, unknown>>;

    const adaptName = (nameInput: string | StoreKey<string, StoreValue>): NamespaceHandle =>
        typeof nameInput === "string"
            ? store<string, Record<string, unknown>>(qualify(nameInput))
            : ({ ...nameInput, name: qualify(nameInput.name) } as NamespaceHandle);

    const escapePathSegment = (segment: string): string =>
        segment.replace(/\\/g, "\\\\").replace(/\./g, "\\.");

    const normalizePath = (path: string | readonly string[]): string =>
        typeof path === "string"
            ? path
            : path.map((segment) => escapePathSegment(String(segment))).join(".");

    return {
        store: <Name extends string, State = StoreValue>(name: Name): StoreKey<Name, State> =>
            ({ name: qualify(name) } as StoreKey<Name, State>),
        create: <Name extends string, State>(name: Name, data: NonFunction<State>, options?: StoreOptions<State>) =>
            createStore(qualify(name), data, options),
        createStrict: <Name extends string, State>(name: Name, data: NonFunction<State>, options?: StoreOptions<State>) =>
            createStoreStrict(qualify(name), data, options),
        set: (name: string | StoreKey<string, StoreValue>, ...rest: unknown[]) => {
            if (rest.length === 1) {
                return setStoreWithContext(adaptName(name), rest[0], undefined, null);
            }
            if (rest.length === 2) {
                return setStoreWithContext(adaptName(name), rest[0], rest[1], null);
            }
            return { ok: false, reason: "invalid-args" } as const;
        },
        get: (name: string | StoreKey<string, StoreValue>, path?: string | readonly string[]) =>
            path === undefined
                ? getStore(adaptName(name))
                : getStore(adaptName(name), normalizePath(path)),
        delete: (name: string) => deleteStore(adaptName(name)),
        reset: (name: string) => resetStore(adaptName(name)),
    };
};
