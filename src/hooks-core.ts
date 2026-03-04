import { useEffect, useCallback, useSyncExternalStore, useRef } from "react";
import { _subscribe, subscribeWithSelector, _getSnapshot, hasStore } from "./store.js";
import { warn, isDev } from "./utils.js";

const pickPath = (data: any, path?: string) => {
    if (!path) return data;
    const parts = path.split(".");
    let current = data;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = current[part];
    }
    return current ?? null;
};

const _broadUseStoreWarnings = new Set<string>();

const shallowEqual = (a: any, b: any): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        if (!Object.is(a[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
};

export function useStore<T = any>(name: string, path?: string): T | null;
export function useStore<T = any, R = any>(
    name: string,
    selector: (state: T) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useStore<T = any, R = any>(
    name: string,
    pathOrSelector?: string | ((state: T) => R),
    equalityFn: (a: R, b: R) => boolean = Object.is
): T | R | null {
    const hasSelector = typeof pathOrSelector === "function";
    const path = typeof pathOrSelector === "string" ? pathOrSelector : undefined;
    const selector = hasSelector ? (pathOrSelector as (state: T) => R) : undefined;

    const subscribe = useCallback(
        (fn: () => void) =>
            hasSelector
                ? subscribeWithSelector(name, (state) => selector!(state as T), equalityFn, fn)
                : _subscribe(name, () => fn()),
        [name, hasSelector, selector, equalityFn]
    );

    const getSnapshot = useCallback(() => {
        const snap = _getSnapshot(name);
        if (hasSelector) {
            if (snap === null || snap === undefined) return null;
            return selector!(snap as T);
        }
        return pickPath(snap, path);
    }, [name, hasSelector, selector, path]);

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (!hasStore(name)) {
            warn(
                `useStore("${name}") - store not found yet.\n` +
                `Component will update automatically when createStore("${name}") is called.`
            );
        }
        if (isDev() && !hasSelector && !path && !_broadUseStoreWarnings.has(name)) {
            _broadUseStoreWarnings.add(name);
            warn(
                `useStore("${name}") without a selector/path subscribes to the entire store and may re-render on every change.\n` +
                `Prefer useSelector/useStoreField for better performance.`
            );
        }
    }, [name, hasSelector, path]);

    return state as T | R | null;
}

export const useStoreField = <T = any>(storeName: string, field: string): T | null =>
    useStore<T>(storeName, field);

export const useSelector = <T = any, R = any>(
    storeName: string,
    selectorFn: (state: T) => R,
    equalityFn: (a: R, b: R) => boolean = shallowEqual
): R | null => {
    const lastSelection = useRef<R | null>(null);

    const selectValue = useCallback((data: T | null): R | null => {
        if (data === null || data === undefined) return null;
        const next = selectorFn(data);
        const prev = lastSelection.current;
        if (prev !== null && equalityFn(next, prev as R)) return prev;
        lastSelection.current = next;
        return next;
    }, [selectorFn, equalityFn]);

    const getSnap = useCallback(() => {
        const data = _getSnapshot(storeName) as T | null;
        return selectValue(data);
    }, [storeName, selectValue]);

    const subscribe = useCallback((notify: () => void) => {
        return subscribeWithSelector(
            storeName,
            (state) => selectValue(state as T),
            equalityFn,
            () => notify()
        );
    }, [storeName, selectValue, equalityFn]);

    const selection = useSyncExternalStore(subscribe, getSnap, getSnap);
    return selection as R | null;
};

export const useStoreStatic = <T = any>(name: string, path?: string): T | null => {
    const data = _getSnapshot(name);
    if (data === null || data === undefined) return null;
    return pickPath(data, path);
};
