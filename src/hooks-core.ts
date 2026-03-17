/**
 * @module hooks-core
 *
 * LAYER: React hooks
 * OWNS:  Module-level behavior and exports for hooks-core.
 *
 * Consumers: Internal imports and public API.
 */
import { useEffect, useCallback, useSyncExternalStore, useRef } from "react";
import { subscribeStore, getStoreSnapshot } from "./store-notify.js";
import { hasStore } from "./store-read.js";
import { subscribeWithSelector } from "./selectors.js";
import { getByPath, warn, warnAlways, isDev, shallowEqual } from "./utils.js";
import { getConfig } from "./internals/config.js";
import type {
    Path,
    PathValue,
    StoreDefinition,
    StoreKey,
    StoreName,
    StateFor,
} from "./store-lifecycle/types.js";
import {
    hasBroadUseStoreWarning,
    markBroadUseStoreWarning,
    hasMissingUseStoreWarning,
    markMissingUseStoreWarning,
    hasLooseUseStoreWarning,
    markLooseUseStoreWarning,
} from "./internals/hooks-warnings.js";

const pickPath = (data: any, path?: string) => {
    if (!path) return data;
    const current = getByPath(data, path);
    return current ?? null;
};

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

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

const warnBroadUseStoreOnce = (name: string, hasSelector: boolean, path?: string): void => {
    if (hasSelector || path) return;
    if (hasBroadUseStoreWarning(name)) return;
    markBroadUseStoreWarning(name);
    warnAlways(
        `useStore("${name}") without a selector/path subscribes to the entire store and may re-render on every change.\n` +
        `Prefer useSelector/useStoreField for better performance.`
    );
};

const warnLooseUseStoreOnce = (nameInput: unknown, storeName: string): void => {
    if (!isDev()) return;
    if (getConfig().acknowledgeLooseTypes) return;
    if (hasLooseUseStoreWarning()) return;
    if (typeof nameInput !== "string") return;
    markLooseUseStoreWarning();
    warn(
        `useStore("${storeName}") - store name is untyped.\n` +
        `Extend StoreStateMap for full type safety and path inference.\n` +
        `See: https://stroid.dev/docs/strict-mode`
    );
};

export function useStore<Name extends string, State, P extends Path<State>>(
    name: StoreDefinition<Name, State>,
    path: P
): StoreSnapshot<PathValue<State, P>> | null;
export function useStore<Name extends string, State>(
    name: StoreDefinition<Name, State>,
    path?: undefined
): StoreSnapshot<State> | null;
export function useStore<Name extends string, State, R>(
    name: StoreDefinition<Name, State>,
    selector: (state: StoreSnapshot<State>) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useStore<Name extends string, State, P extends Path<State>>(
    name: StoreKey<Name, State>,
    path: P
): StoreSnapshot<PathValue<State, P>> | null;
export function useStore<Name extends string, State>(
    name: StoreKey<Name, State>,
    path?: undefined
): StoreSnapshot<State> | null;
export function useStore<Name extends string, State, R>(
    name: StoreKey<Name, State>,
    selector: (state: StoreSnapshot<State>) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useStore<Name extends StoreName, P extends Path<StateFor<Name>>>(
    name: Name,
    path: P
): StoreSnapshot<PathValue<StateFor<Name>, P>> | null;
export function useStore<Name extends StoreName>(
    name: Name,
    path?: undefined
): StoreSnapshot<StateFor<Name>> | null;
export function useStore<Name extends StoreName, R>(
    name: Name,
    selector: (state: StoreSnapshot<StateFor<Name>>) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useStore<T = unknown, R = unknown>(
    name: string | StoreDefinition<string, T> | StoreKey<string, T>,
    pathOrSelector?: string | ((state: T) => R),
    equalityFn: (a: R, b: R) => boolean = Object.is
): T | R | null {
    const storeName = typeof name === "string" ? name : name.name;
    const hasSelector = typeof pathOrSelector === "function";
    const path = typeof pathOrSelector === "string" ? pathOrSelector : undefined;
    const selector = hasSelector ? (pathOrSelector as (state: T) => R) : undefined;
    const selectorRef = useRef<typeof selector>(selector);
    const equalityRef = useRef(equalityFn);
    const selectorCache = useRef<SelectorCache<R>>(createSelectorCache<R>());
    const selectorIdentityWarned = useRef(false);
    const prevSelectorRef = useRef<typeof selector>(selector);

    selectorRef.current = selector;
    equalityRef.current = equalityFn;

    const readSelectedSnapshot = useCallback(
        (snapshot: T | null): R | null =>
            readSelectorCache(storeName, snapshot, selectorRef, equalityRef, selectorCache),
        [storeName]
    );

    const subscribe = useCallback(
        (fn: () => void) =>
            hasSelector
                ? subscribeWithSelector(
                    storeName,
                    (state) => selectorRef.current!(state as T),
                    (a, b) => equalityRef.current(a, b),
                    fn
                )
                : subscribeStore(storeName, () => fn()),
        [storeName, hasSelector]
    );

    const getSnapshot = useCallback(() => {
        const snap = getStoreSnapshot(storeName);
        warnLooseUseStoreOnce(name, storeName);
        warnMissingStoreOnce(storeName);
        warnBroadUseStoreOnce(storeName, hasSelector, path);
        if (hasSelector) {
            return readSelectedSnapshot(snap as T | null);
        }
        return pickPath(snap, path);
    }, [storeName, hasSelector, path, readSelectedSnapshot]);

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (isDev() && hasSelector) {
            const prev = prevSelectorRef.current;
            if (prev && prev !== selector && !selectorIdentityWarned.current) {
                selectorIdentityWarned.current = true;
                warn(
                    `useStore("${storeName}") selector was recreated between renders. ` +
                    `This can cause repeated subscriptions. Wrap the selector in useCallback or define it outside the component.`
                );
            }
            prevSelectorRef.current = selector;
        }

    }, [storeName, hasSelector, path, selector]);

    return state as StoreSnapshot<T> | R | null;
}

export function useStoreField<Name extends string, State, P extends Path<State>>(
    storeName: StoreDefinition<Name, State> | StoreKey<Name, State>,
    field: P
): StoreSnapshot<PathValue<State, P>> | null;
export function useStoreField<Name extends StoreName, P extends Path<StateFor<Name>>>(
    storeName: Name,
    field: P
): StoreSnapshot<PathValue<StateFor<Name>, P>> | null;
export function useStoreField(storeName: any, field: any): unknown {
    return useStore(storeName, field);
}

export function useSelector<Name extends string, State, R>(
    storeName: StoreDefinition<Name, State> | StoreKey<Name, State>,
    selectorFn: (state: StoreSnapshot<State>) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useSelector<Name extends StoreName, R>(
    storeName: Name,
    selectorFn: (state: StoreSnapshot<StateFor<Name>>) => R,
    equalityFn?: (a: R, b: R) => boolean
): R | null;
export function useSelector<T = unknown, R = unknown>(
    storeName: string | StoreDefinition<string, T> | StoreKey<string, T>,
    selectorFn: (state: T) => R,
    equalityFn: (a: R, b: R) => boolean = shallowEqual
): R | null {
    const resolvedName = typeof storeName === "string" ? storeName : storeName.name;
    const selectorRef = useRef(selectorFn);
    const equalityRef = useRef(equalityFn);
    const selectorCache = useRef<SelectorCache<R>>(createSelectorCache<R>());
    const selectorIdentityWarned = useRef(false);
    const prevSelectorRef = useRef(selectorFn);

    selectorRef.current = selectorFn;
    equalityRef.current = equalityFn;

    const selectValue = useCallback(
        (data: T | null): R | null =>
            readSelectorCache(resolvedName, data, selectorRef, equalityRef, selectorCache),
        [resolvedName]
    );

    const getSnap = useCallback(() => {
        const data = getStoreSnapshot(resolvedName) as T | null;
        warnMissingStoreOnce(resolvedName);
        return selectValue(data);
    }, [resolvedName, selectValue]);

    const subscribe = useCallback((notify: () => void) => {
        return subscribeWithSelector(
            resolvedName,
            (state) => selectorRef.current(state as T),
            (a, b) => equalityRef.current(a, b),
            () => notify()
        );
    }, [resolvedName]);

    const selection = useSyncExternalStore(subscribe, getSnap, getSnap);

    useEffect(() => {
        if (!isDev()) return;
        const prev = prevSelectorRef.current;
        if (prev && prev !== selectorFn && !selectorIdentityWarned.current) {
            selectorIdentityWarned.current = true;
            warn(
                `useSelector("${resolvedName}") selector was recreated between renders. ` +
                `Wrap it in useCallback or define it outside the component to avoid resubscribe churn.`
            );
        }
        prevSelectorRef.current = selectorFn;
    }, [resolvedName, selectorFn]);

    return selection as R | null;
}

export function useStoreStatic<Name extends string, State, P extends Path<State>>(
    name: StoreDefinition<Name, State> | StoreKey<Name, State>,
    path: P
): StoreSnapshot<PathValue<State, P>> | null;
export function useStoreStatic<Name extends string, State>(
    name: StoreDefinition<Name, State> | StoreKey<Name, State>,
    path?: undefined
): StoreSnapshot<State> | null;
export function useStoreStatic<Name extends StoreName, P extends Path<StateFor<Name>>>(
    name: Name,
    path: P
): StoreSnapshot<PathValue<StateFor<Name>, P>> | null;
export function useStoreStatic<Name extends StoreName>(
    name: Name,
    path?: undefined
): StoreSnapshot<StateFor<Name>> | null;
export function useStoreStatic(
    name: string | StoreDefinition<string, unknown> | StoreKey<string, unknown>,
    path?: string
): unknown {
    const resolvedName = typeof name === "string" ? name : name.name;
    const data = getStoreSnapshot(resolvedName);
    warnMissingStoreOnce(resolvedName);
    if (data === null || data === undefined) return null;
    return pickPath(data, path);
}


