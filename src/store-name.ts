import type { StoreKey, StoreValue } from "./store-lifecycle.js";

/**
 * Helper to get an auto-completable, literal-typed store handle without creating it.
 *
 * Example:
 *   const user = store("user");
 *   setStore(user, "name", "Alex");
 */
export const store = <Name extends string, State = StoreValue>(name: Name): StoreKey<Name, State> =>
    ({ name } as StoreKey<Name, State>);
