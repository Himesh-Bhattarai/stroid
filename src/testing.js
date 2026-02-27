import { createStore, setStore, resetStore, clearAllStores } from "./store.js";

export const createMockStore = (name = "mock", initial = {}) => {
    createStore(name, initial);
    return {
        set: (update) => setStore(name, update),
        reset: () => resetStore(name),
        use: () => ({ name }),
    };
};

export const withMockedTime = (nowMs, fn) => {
    const realDateNow = Date.now;
    Date.now = () => nowMs;
    try {
        return fn();
    } finally {
        Date.now = realDateNow;
    }
};

export const resetAllStoresForTest = () => clearAllStores();

export const benchmarkStoreSet = (name, iterations = 1000, makeUpdate = (i) => ({ value: i })) => {
    const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    for (let i = 0; i < iterations; i++) {
        setStore(name, makeUpdate(i));
    }
    const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const total = end - start;
    return { iterations, totalMs: total, avgMs: total / iterations };
};
