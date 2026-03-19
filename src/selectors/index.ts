/**
 * @module selectors
 *
 * LAYER: Selectors
 * OWNS:  Module-level behavior and exports for selectors.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getSelectorStoreValueRef,
    hasSelectorStoreEntry,
    subscribeSelectorStore,
    type SelectorStoreValue as StoreValue,
} from "../internals/selector-store.js";
import { deepClone, shallowClone, getByPath, warn } from "../utils.js";
import { getStoreSnapshot } from "../core/store-notify.js";
import { meta } from "../core/store-lifecycle/registry.js";
import { getConfig } from "../internals/config.js";
import type { SnapshotMode } from "../adapters/options.js";

type SelectorDependency = string[];

const trackSelectorDependencies = <TState, TResult>(
    state: TState,
    selectorFn: (state: TState) => TResult
): { result: TResult; deps: SelectorDependency[] } => {
    const seen = new WeakMap<object, unknown>();
    const deps = new Set<string>();
    const sep = "\u0000";

    const wrap = (value: unknown, path: string[]): unknown => {
        if (!value || typeof value !== "object") return value;
        const cached = seen.get(value as object);
        if (cached) return cached;

        const proxy = new Proxy(value as object, {
            get(target, prop, receiver) {
                if (typeof prop !== "string") {
                    return Reflect.get(target, prop, receiver);
                }
                const nextPath = [...path, prop];
                const result = Reflect.get(target, prop, receiver);
                if (!result || typeof result !== "object") {
                    deps.add(nextPath.join(sep));
                }
                return wrap(result, nextPath);
            },
        });

        seen.set(value as object, proxy);
        return proxy;
    };

    const result = selectorFn(wrap(state, []) as TState);
    return {
        result,
        deps: Array.from(deps, (entry) => entry.split(sep)),
    };
};

const selectorDepsChanged = <TState>(prev: TState, next: TState, deps: SelectorDependency[]): boolean =>
    deps.some((path) => !Object.is(getByPath(prev, path), getByPath(next, path)));

export const createSelector = <TState, TResult>(storeName: string, selectorFn: (state: TState) => TResult) => {
    let lastRef: TState | undefined;
    let lastResult: TResult | undefined;
    let lastDeps: SelectorDependency[] = [];
    return () => {
        const state = getSelectorStoreValueRef(storeName) as TState | undefined;
        if (state === undefined) return null;
        if (state === lastRef) return lastResult ?? null;
        if (lastRef !== undefined && lastDeps.length > 0 && !selectorDepsChanged(lastRef, state, lastDeps)) {
            lastRef = state;
            return lastResult ?? null;
        }
        // TODO: regression test for selectorCloneFrozen with frozen store refs.
        const shouldCloneFrozen = getConfig().selectorCloneFrozen;
        const trackState = (state && typeof state === "object" && Object.isFrozen(state as object) && shouldCloneFrozen)
            ? deepClone(state)
            : state;
        const tracked = trackSelectorDependencies(trackState as TState, selectorFn);
        lastRef = state;
        lastDeps = tracked.deps;
        lastResult = tracked.result;
        return lastResult ?? null;
    };
};

export const subscribeWithSelector = <R>(
    name: string,
    selector: (state: any) => R,
    equality: (a: R, b: R) => boolean = Object.is,
    listener: (next: R, prev: R) => void
): (() => void) => {
    if (typeof selector !== "function" || typeof listener !== "function") {
        warn(`subscribeWithSelector("${name}") requires selector and listener functions.`);
        return () => {};
    }
    let hasPrev = false;
    let prevSel = undefined as R;

    const resolveSnapshotMode = (): SnapshotMode => {
        const mode = meta[name]?.options?.snapshot;
        return mode === "shallow" || mode === "ref" ? mode : "deep";
    };

    const getSafeSelectorState = (snapshot?: StoreValue | null): unknown => {
        const ref = snapshot !== undefined ? snapshot : getStoreSnapshot(name);
        if (ref === null || typeof ref !== "object") return ref;
        const mode = resolveSnapshotMode();
        if (mode === "ref") return ref;
        if (mode === "shallow") return shallowClone(ref);
        return deepClone(ref);
    };

    if (hasSelectorStoreEntry(name)) {
        prevSel = selector(getSafeSelectorState());
        hasPrev = true;
    }

    const wrapped = (_state: StoreValue | null) => {
        if (_state === null || !hasSelectorStoreEntry(name)) {
            hasPrev = false;
            prevSel = undefined as R;
            return;
        }
        const nextSel = selector(getSafeSelectorState(_state));
        if (!hasPrev) {
            const last = prevSel;
            hasPrev = true;
            prevSel = nextSel;
            listener(nextSel, last);
            return;
        }
        const matches = equality(nextSel, prevSel);
        if (!matches) {
            const last = prevSel;
            prevSel = nextSel;
            listener(nextSel, last);
        }
    };
    return subscribeSelectorStore(name, wrapped);
};


