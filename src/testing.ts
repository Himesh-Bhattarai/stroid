import { createStore, setStore, resetStore, clearAllStores } from "./store.js";

export const createMockStore = (name = "mock", initial: Record<string, unknown> = {}) => {
    createStore(name, initial);
    return {
        set: (update: Record<string, unknown> | ((draft: any) => void)) => setStore(name, update as any),
        reset: () => resetStore(name),
        use: () => ({ name }),
    };
};

export const withMockedTime = <T>(nowMs: number, fn: () => T): T => {
    const realDateNow = Date.now;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Date.now = () => nowMs;
    try {
        return fn();
    } finally {
        Date.now = realDateNow;
    }
};

export const resetAllStoresForTest = (): void => clearAllStores();

export const benchmarkStoreSet = (
    name: string,
    iterations = 1000,
    makeUpdate: (i: number) => Record<string, unknown> = (i) => ({ value: i })
) => {
    const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    for (let i = 0; i < iterations; i++) {
        setStore(name, makeUpdate(i));
    }
    const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const total = end - start;
    return { iterations, totalMs: total, avgMs: total / iterations };
};
