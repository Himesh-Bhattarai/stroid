/**
 * @module store-name
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-name.
 *
 * Consumers: Internal imports and public API.
 */
import type { StoreKey, StoreValue } from "./store-lifecycle/types.js";
import type { StoreOptions } from "./adapters/options.js";
import { createStore, createStoreStrict, setStore, deleteStore, resetStore } from "./store-write.js";
import { getStore } from "./store-read.js";

/**
 * Helper to get an auto-completable, literal-typed store handle without creating it.
 *
 * Example:
 *   const user = store("user");
 *   setStore(user, "name", "Alex");
 */
export const store = <Name extends string, State = StoreValue>(name: Name): StoreKey<Name, State> =>
    ({ name } as StoreKey<Name, State>);

type NonFunction<T> = T extends (...args: any[]) => any ? never : T;

export const namespace = (ns: string) => {
    const prefix = `${ns}::`;
    const qualify = (name: string) => (name.includes("::") ? name : `${prefix}${name}`);
    const adaptName = (name: any) =>
        typeof name === "string" ? store(qualify(name)) : { ...(name as any), name: qualify((name as any).name) };
    return {
        store: <Name extends string, State = StoreValue>(name: Name): StoreKey<Name, State> =>
            ({ name: qualify(name) } as StoreKey<Name, State>),
        create: <Name extends string, State>(name: Name, data: NonFunction<State>, options?: StoreOptions<State>) =>
            createStore(qualify(name), data, options),
        createStrict: <Name extends string, State>(name: Name, data: NonFunction<State>, options?: StoreOptions<State>) =>
            createStoreStrict(qualify(name), data, options),
        set: (name: any, ...rest: any[]) => {
            const restParams = rest as [any?, ...any[]];
            return (setStore as any)(adaptName(name), ...restParams);
        },
        get: (name: any, ...rest: any[]) => {
            const restParams = rest as [any?, ...any[]];
            return (getStore as any)(adaptName(name), ...restParams);
        },
        delete: (name: string) => deleteStore(adaptName(name)),
        reset: (name: string) => resetStore(adaptName(name)),
    };
};


