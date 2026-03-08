import type { StoreValue } from "../adapters/options.js";

export type HistoryDiff = { added: string[]; removed: string[]; changed: string[] } | null;

export type HistoryEntry = {
    ts: number;
    action: string;
    prev: StoreValue;
    next: StoreValue;
    diff: HistoryDiff;
};

export const initDevtools = ({
    name,
    useDevtools,
    existingDevtools,
    stores,
    warn,
}: {
    name: string;
    useDevtools: boolean;
    existingDevtools: any;
    stores: Record<string, StoreValue>;
    warn: (message: string) => void;
}): any => {
    if (!useDevtools) return existingDevtools;
    if (typeof window === "undefined") return existingDevtools;
    const ext = (window as any).__REDUX_DEVTOOLS_EXTENSION__ || (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    if (!ext || typeof ext.connect !== "function") {
        warn(`DevTools requested for "${name}" but Redux DevTools extension not found.`);
        return existingDevtools;
    }
    if (existingDevtools) return existingDevtools;
    const devtools = ext.connect({ name: "stroid" });
    devtools.init(stores);
    return devtools;
};

export const applyRedactor = ({
    data,
    redactor,
    deepClone,
}: {
    data: StoreValue;
    redactor?: (state: StoreValue) => StoreValue;
    deepClone: <T>(value: T) => T;
}): StoreValue => {
    if (typeof redactor === "function") {
        try { return redactor(deepClone(data)); }
        catch (_) { return data; }
    }
    return data;
};

export const diffShallow = (prev: StoreValue, next: StoreValue): HistoryDiff => {
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) return null;
    const prevObj = prev as Record<string, unknown>;
    const nextObj = next as Record<string, unknown>;
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const prevKeys = new Set(Object.keys(prevObj));
    const nextKeys = new Set(Object.keys(nextObj));
    nextKeys.forEach((k) => {
        if (!prevKeys.has(k)) added.push(k);
        else if (!Object.is(prevObj[k], nextObj[k])) changed.push(k);
    });
    prevKeys.forEach((k) => {
        if (!nextKeys.has(k)) removed.push(k);
    });
    return { added, removed, changed };
};

export const pushHistory = ({
    name,
    action,
    prev,
    next,
    history,
    historyLimit,
    applyRedactor,
    deepClone,
}: {
    name: string;
    action: string;
    prev: StoreValue;
    next: StoreValue;
    history: Record<string, HistoryEntry[]>;
    historyLimit: number;
    applyRedactor: (value: StoreValue) => StoreValue;
    deepClone: <T>(value: T) => T;
}): void => {
    if (historyLimit === 0) return;
    if (!history[name]) history[name] = [];
    const entry: HistoryEntry = {
        ts: Date.now(),
        action,
        prev: deepClone(applyRedactor(prev)),
        next: deepClone(applyRedactor(next)),
        diff: diffShallow(prev, next),
    };
    history[name].push(entry);
    if (history[name].length > historyLimit) {
        history[name].splice(0, history[name].length - historyLimit);
    }
};

export const sendDevtools = ({
    name,
    action,
    force = false,
    devtools,
    enabled,
    stores,
    applyRedactor,
}: {
    name: string;
    action: string;
    force?: boolean;
    devtools: any;
    enabled: boolean;
    stores: Record<string, StoreValue>;
    applyRedactor: (value: StoreValue) => StoreValue;
}): void => {
    if (!devtools || (!force && !enabled)) return;
    try {
        const state = { ...stores, [name]: applyRedactor(stores[name]) };
        devtools.send({ type: `${name}/${action}` }, state);
    } catch (_) {
        // ignore devtools transport errors
    }
};
