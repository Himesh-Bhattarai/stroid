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

type SelectorCache<R> = {
    hasValue: boolean;
    storeName: string;
    snapshot: unknown;
    selector: unknown;
    value: R | null;
};

const createSelectorCache = <R,>(): SelectorCache<R> => ({
    hasValue: false,
    storeName: "",
    snapshot: undefined,
    selector: undefined,
    value: null,
});

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
    const selectorRef = useRef<typeof selector>(selector);
    const equalityRef = useRef(equalityFn);
    const selectorCache = useRef<SelectorCache<R>>(createSelectorCache<R>());

    selectorRef.current = selector;
    equalityRef.current = equalityFn;

    const readSelectedSnapshot = useCallback((snapshot: T | null): R | null => {
        if (snapshot === null || snapshot === undefined || !selectorRef.current) {
            selectorCache.current = {
                hasValue: true,
                storeName: name,
                snapshot,
                selector: selectorRef.current,
                value: null,
            };
            return null;
        }

        const currentSelector = selectorRef.current;
        const cache = selectorCache.current;
        if (
            cache.hasValue
            && cache.storeName === name
            && cache.snapshot === snapshot
            && cache.selector === currentSelector
        ) {
            return cache.value;
        }

        const next = currentSelector(snapshot);
        if (
            cache.hasValue
            && cache.storeName === name
            && equalityRef.current(next, cache.value as R)
        ) {
            cache.snapshot = snapshot;
            cache.selector = currentSelector;
            return cache.value;
        }

        cache.hasValue = true;
        cache.storeName = name;
        cache.snapshot = snapshot;
        cache.selector = currentSelector;
        cache.value = next;
        return next;
    }, [name]);

    const subscribe = useCallback(
        (fn: () => void) =>
            hasSelector
                ? subscribeWithSelector(
                    name,
                    (state) => selectorRef.current!(state as T),
                    (a, b) => equalityRef.current(a, b),
                    fn
                )
                : _subscribe(name, () => fn()),
        [name, hasSelector]
    );

    const getSnapshot = useCallback(() => {
        const snap = _getSnapshot(name);
        if (hasSelector) {
            return readSelectedSnapshot(snap as T | null);
        }
        return pickPath(snap, path);
    }, [name, hasSelector, path, readSelectedSnapshot]);

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
    const selectorRef = useRef(selectorFn);
    const equalityRef = useRef(equalityFn);
    const selectorCache = useRef<SelectorCache<R>>(createSelectorCache<R>());

    selectorRef.current = selectorFn;
    equalityRef.current = equalityFn;

    const selectValue = useCallback((data: T | null): R | null => {
        if (data === null || data === undefined) {
            selectorCache.current = {
                hasValue: true,
                storeName,
                snapshot: data,
                selector: selectorRef.current,
                value: null,
            };
            return null;
        }

        const currentSelector = selectorRef.current;
        const cache = selectorCache.current;
        if (
            cache.hasValue
            && cache.storeName === storeName
            && cache.snapshot === data
            && cache.selector === currentSelector
        ) {
            return cache.value;
        }

        const next = currentSelector(data);
        if (
            cache.hasValue
            && cache.storeName === storeName
            && equalityRef.current(next, cache.value as R)
        ) {
            cache.snapshot = data;
            cache.selector = currentSelector;
            return cache.value;
        }

        cache.hasValue = true;
        cache.storeName = storeName;
        cache.snapshot = data;
        cache.selector = currentSelector;
        cache.value = next;
        return next;
    }, [storeName]);

    const getSnap = useCallback(() => {
        const data = _getSnapshot(storeName) as T | null;
        return selectValue(data);
    }, [storeName, selectValue]);

    const subscribe = useCallback((notify: () => void) => {
        return subscribeWithSelector(
            storeName,
            (state) => selectorRef.current(state as T),
            (a, b) => equalityRef.current(a, b),
            () => notify()
        );
    }, [storeName]);

    const selection = useSyncExternalStore(subscribe, getSnap, getSnap);
    return selection as R | null;
};

export const useStoreStatic = <T = any>(name: string, path?: string): T | null => {
    const data = _getSnapshot(name);
    if (data === null || data === undefined) return null;
    return pickPath(data, path);
};
