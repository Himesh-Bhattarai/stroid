import { useEffect, useCallback, useSyncExternalStore, useRef } from "react";
import { subscribeStore, getStoreSnapshot, hasStore } from "./store.js";
import { subscribeWithSelector } from "./selectors.js";
import { getByPath, warn, isDev, shallowEqual } from "./utils.js";
import {
    hasBroadUseStoreWarning,
    markBroadUseStoreWarning,
    hasMissingUseStoreWarning,
    markMissingUseStoreWarning,
} from "./internals/hooks-warnings.js";

const pickPath = (data: any, path?: string) => {
    if (!path) return data;
    const current = getByPath(data, path);
    return current ?? null;
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

const readSelectorCache = <T, R>(
    storeName: string,
    snapshot: T | null,
    selectorRef: React.MutableRefObject<((state: T) => R) | undefined>,
    equalityRef: React.MutableRefObject<(a: R, b: R) => boolean>,
    cacheRef: React.MutableRefObject<SelectorCache<R>>
): R | null => {
    if (snapshot === null || snapshot === undefined || !selectorRef.current) {
        cacheRef.current = {
            hasValue: true,
            storeName,
            snapshot,
            selector: selectorRef.current,
            value: null,
        };
        return null;
    }

    const currentSelector = selectorRef.current;
    const cache = cacheRef.current;
    if (
        cache.hasValue
        && cache.storeName === storeName
        && cache.snapshot === snapshot
        && cache.selector === currentSelector
    ) {
        return cache.value;
    }

    const next = currentSelector(snapshot);
    if (
        cache.hasValue
        && cache.storeName === storeName
        && equalityRef.current(next, cache.value as R)
    ) {
        cache.snapshot = snapshot;
        cache.selector = currentSelector;
        return cache.value;
    }

    cache.hasValue = true;
    cache.storeName = storeName;
    cache.snapshot = snapshot;
    cache.selector = currentSelector;
    cache.value = next;
    return next;
};

const warnMissingStoreOnce = (name: string): void => {
    if (hasStore(name)) return;
    if (hasMissingUseStoreWarning(name)) return;
    markMissingUseStoreWarning(name);
    warn(
        `useStore("${name}") - store not found yet.\n` +
        `Component will update automatically when createStore("${name}") is called.`
    );
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
    const selectorRef = useRef<typeof selector>(selector);
    const equalityRef = useRef(equalityFn);
    const selectorCache = useRef<SelectorCache<R>>(createSelectorCache<R>());

    selectorRef.current = selector;
    equalityRef.current = equalityFn;

    const readSelectedSnapshot = useCallback(
        (snapshot: T | null): R | null =>
            readSelectorCache(name, snapshot, selectorRef, equalityRef, selectorCache),
        [name]
    );

    const subscribe = useCallback(
        (fn: () => void) =>
            hasSelector
                ? subscribeWithSelector(
                    name,
                    (state) => selectorRef.current!(state as T),
                    (a, b) => equalityRef.current(a, b),
                    fn
                )
                : subscribeStore(name, () => fn()),
        [name, hasSelector]
    );

    const getSnapshot = useCallback(() => {
        const snap = getStoreSnapshot(name);
        warnMissingStoreOnce(name);
        if (hasSelector) {
            return readSelectedSnapshot(snap as T | null);
        }
        return pickPath(snap, path);
    }, [name, hasSelector, path, readSelectedSnapshot]);

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (isDev() && !hasSelector && !path && !hasBroadUseStoreWarning(name)) {
            markBroadUseStoreWarning(name);
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

    const selectValue = useCallback(
        (data: T | null): R | null =>
            readSelectorCache(storeName, data, selectorRef, equalityRef, selectorCache),
        [storeName]
    );

    const getSnap = useCallback(() => {
        const data = getStoreSnapshot(storeName) as T | null;
        warnMissingStoreOnce(storeName);
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
    const data = getStoreSnapshot(name);
    warnMissingStoreOnce(name);
    if (data === null || data === undefined) return null;
    return pickPath(data, path);
};
