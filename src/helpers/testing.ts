/**
 * @module testing
 *
 * LAYER: Testing
 * OWNS:  Module-level behavior and exports for testing.
 *
 * Consumers: Internal imports and public API.
 */
import { _resetAsyncStateForTests } from "../async.js";
import { createStore, setStore, resetStore } from "../core/store-write.js";
import { store } from "../core/store-name.js";
import type { PartialDeep, StoreDefinition, StoreKey } from "../core/store-lifecycle/types.js";
import { _hardResetAllStoresForTest } from "../core/store-write.js";
import type { NonFunction } from "../types/utility.js";

export const createMockStore = <Name extends string, State extends Record<string, unknown> = Record<string, unknown>>(
    name: Name = "mock" as Name,
    initial: State = {} as State
) => {
    const handle = store<Name, State>(name);
    createStore(name, initial as NonFunction<State>);
    return {
        set: (update: PartialDeep<State> | ((draft: State) => void)) => {
            if (typeof update === "function") return setStore(handle, update);
            return setStore(handle, update);
        },
        reset: () => resetStore(handle),
        use: (): StoreDefinition<Name, State> => handle,
    };
};

export const withMockedTime = <T>(nowMs: number, fn: () => T): T => {
    const realDateNow = Date.now;
    Object.defineProperty(Date, "now", {
        value: () => nowMs,
        configurable: true,
    });
    try {
        return fn();
    } finally {
        Object.defineProperty(Date, "now", {
            value: realDateNow,
            configurable: true,
        });
    }
};

export const resetAllStoresForTest = (): void => {
    _hardResetAllStoresForTest();
    _resetAsyncStateForTests();
};

export const benchmarkStoreSet = <Name extends string, State extends Record<string, unknown>>(
    name: StoreDefinition<Name, State> | StoreKey<Name, State>,
    iterations = 1000,
    makeUpdate: (i: number) => PartialDeep<State> = (i) => ({ value: i } as PartialDeep<State>)
) => {
    const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    for (let i = 0; i < iterations; i++) {
        setStore(name, makeUpdate(i));
    }
    const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const total = end - start;
    return { iterations, totalMs: total, avgMs: total / iterations };
};


