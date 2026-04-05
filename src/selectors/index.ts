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
import { devDeepFreeze, devShallowFreeze } from "../utils/devfreeze.js";
import { getStoreSnapshot } from "../core/store-notify.js";
import { meta } from "../core/store-lifecycle/registry.js";
import { getConfig } from "../internals/config.js";
import type { SnapshotMode } from "../adapters/options.js";

type SelectorDependency = string[];

// Shared across selector subscriptions: a frozen, non-mutating base snapshot per registry snapshot reference.
// This keeps selector costs near O(subscribers) instead of O(subscribers * deepClone(state)).
//
// If a selector attempts to mutate the base, we auto-clone for that selector only.
type SelectorSnapshotCacheEntry = {
    /** frozen snapshot clone for pure selectors (null => not shareable; fall back to per-selector clone) */
    frozen: object | null;
};
const deepSelectorSnapshotCache = new WeakMap<object, SelectorSnapshotCacheEntry>();
const shallowSelectorSnapshotCache = new WeakMap<object, SelectorSnapshotCacheEntry>();

// For deep snapshots, we only share a frozen base when the graph is plain-object/array.
// (Map/Set/Date etc. remain mutable even when frozen; sharing would regress isolation.)
const isShareablePlainGraph = (root: object): boolean => {
    const stack: object[] = [root];
    const seen = new WeakSet<object>();
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (seen.has(current)) continue;
        seen.add(current);

        // Skip React elements / host objects
        const anyCurrent = current as { $$typeof?: unknown };
        if (anyCurrent.$$typeof) return false;
        if (typeof Element !== "undefined" && current instanceof Element) return false;

        const proto = Object.getPrototypeOf(current);
        const isPlainObject = proto === Object.prototype || proto === null;

        if (Array.isArray(current)) {
            for (const item of current as unknown[]) {
                if (item && typeof item === "object") stack.push(item as object);
            }
            continue;
        }

        if (!isPlainObject) return false;

        const currentRecord = current as Record<string, unknown>;
        for (const key in currentRecord) {
            if (!Object.prototype.hasOwnProperty.call(currentRecord, key)) continue;
            const value = currentRecord[key];
            if (value && typeof value === "object") stack.push(value as object);
        }
    }
    return true;
};

const isMutationError = (err: unknown): boolean => {
    if (!(err instanceof TypeError)) return false;
    const message = (err as { message?: string })?.message ?? String(err);
    return /read only|readonly|cannot assign|cannot add property|cannot delete property/i.test(message);
};

const resolveSelectorSnapshotMode = (name: string): SnapshotMode => {
    const mode = meta[name]?.options?.snapshot;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

const getMutableSelectorSnapshotForMode = (
    ref: StoreValue | null | undefined,
    mode: SnapshotMode
): unknown => {
    if (ref === null || typeof ref !== "object") return ref;
    if (mode === "ref") return ref;
    if (mode === "shallow") return shallowClone(ref);
    return deepClone(ref);
};

const getMutableSelectorSnapshot = (
    name: string,
    snapshot?: StoreValue | null,
    mode?: SnapshotMode
): unknown => {
    const ref = snapshot !== undefined ? snapshot : getStoreSnapshot(name);
    const snapshotMode = mode ?? resolveSelectorSnapshotMode(name);
    return getMutableSelectorSnapshotForMode(ref, snapshotMode);
};

const getFrozenSelectorSnapshotForMode = (
    ref: StoreValue | null | undefined,
    mode: SnapshotMode
): unknown => {
    if (ref === null || typeof ref !== "object") return ref;
    if (mode === "ref") return ref;
    const key = ref as object;

    if (mode === "shallow") {
        const cached = shallowSelectorSnapshotCache.get(key);
        if (cached) {
            return cached.frozen ?? shallowClone(ref);
        }

        const proto = Object.getPrototypeOf(key);
        const rootShareable = Array.isArray(key) || proto === Object.prototype || proto === null;
        if (!rootShareable) {
            shallowSelectorSnapshotCache.set(key, { frozen: null });
            return shallowClone(ref);
        }

        const cloned = shallowClone(ref);
        const frozen = devShallowFreeze(cloned);
        shallowSelectorSnapshotCache.set(key, { frozen });
        return frozen;
    }

    const cached = deepSelectorSnapshotCache.get(key);
    if (cached) {
        return cached.frozen ?? deepClone(ref);
    }

    if (!isShareablePlainGraph(key)) {
        deepSelectorSnapshotCache.set(key, { frozen: null });
        return deepClone(ref);
    }

    const cloned = deepClone(ref);
    const frozen = devDeepFreeze(cloned);
    deepSelectorSnapshotCache.set(key, { frozen });
    return frozen;
};

const getFrozenSelectorSnapshot = (
    name: string,
    snapshot?: StoreValue | null,
    mode?: SnapshotMode
): unknown => {
    const ref = snapshot !== undefined ? snapshot : getStoreSnapshot(name);
    const snapshotMode = mode ?? resolveSelectorSnapshotMode(name);
    return getFrozenSelectorSnapshotForMode(ref, snapshotMode);
};

const trackSelectorDependencies = <TState, TResult>(
    state: TState,
    selectorFn: (state: TState) => TResult
): { result: TResult; deps: SelectorDependency[] } => {
    const seen = new WeakMap<object, unknown>();
    const proxyPaths = new WeakMap<object, string>();
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

        proxyPaths.set(proxy, path.join(sep));
        seen.set(value as object, proxy);
        return proxy;
    };

    const result = selectorFn(wrap(state, []) as TState);

    const collectEscapedProxyDeps = (value: unknown, walked: WeakSet<object>): void => {
        if (!value || typeof value !== "object") return;
        if (walked.has(value as object)) return;
        walked.add(value as object);

        const trackedPath = proxyPaths.get(value as object);
        if (trackedPath) {
            if (trackedPath) deps.add(trackedPath);
            return;
        }

        const valueRecord = value as Record<string, unknown>;
        for (const key in valueRecord) {
            if (!Object.prototype.hasOwnProperty.call(valueRecord, key)) continue;
            collectEscapedProxyDeps(valueRecord[key], walked);
        }
    };

    collectEscapedProxyDeps(result, new WeakSet<object>());

    return {
        result,
        deps: Array.from(deps, (entry) => entry.split(sep)),
    };
};

const selectorDepsChanged = <TState>(prev: TState, next: TState, deps: SelectorDependency[]): boolean => {
    const prevIsObject = prev !== null && typeof prev === "object";
    const nextIsObject = next !== null && typeof next === "object";
    const prevRecord = prev as unknown as Record<string, unknown>;
    const nextRecord = next as unknown as Record<string, unknown>;

    for (let i = 0; i < deps.length; i += 1) {
        const path = deps[i];
        if (path.length === 1 && prevIsObject && nextIsObject) {
            const key = path[0];
            if (!Object.is(prevRecord[key], nextRecord[key])) {
                return true;
            }
            continue;
        }
        if (!Object.is(getByPath(prev, path), getByPath(next, path))) {
            return true;
        }
    }

    return false;
};

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

export const subscribeWithSelector = <TState = unknown, R = unknown>(
    name: string,
    selector: (state: TState) => R,
    equality: (a: R, b: R) => boolean = Object.is,
    listener: (next: R, prev: R | undefined) => void
): (() => void) => {
    if (typeof selector !== "function" || typeof listener !== "function") {
        warn(`subscribeWithSelector("${name}") requires selector and listener functions.`);
        return () => {};
    }
    let hasPrev = false;
    let prevSel: R | undefined = undefined;
    let needsMutableSnapshot = false;
    let snapshotMode = "deep" as SnapshotMode;
    let snapshotModeReady = false;

    if (hasSelectorStoreEntry(name)) {
        snapshotMode = resolveSelectorSnapshotMode(name);
        snapshotModeReady = true;
        try {
            prevSel = selector(getFrozenSelectorSnapshot(name, undefined, snapshotMode) as TState);
        } catch (err) {
            if (!isMutationError(err)) throw err;
            needsMutableSnapshot = true;
            prevSel = selector(getMutableSelectorSnapshot(name, undefined, snapshotMode) as TState);
        }
        hasPrev = true;
    }

    const wrapped = (_state: StoreValue | null) => {
        if (_state === null) {
            hasPrev = false;
            prevSel = undefined as R;
            snapshotModeReady = false;
            return;
        }
        if (_state === undefined && !hasSelectorStoreEntry(name)) {
            hasPrev = false;
            prevSel = undefined as R;
            snapshotModeReady = false;
            return;
        }
        if (!snapshotModeReady) {
            snapshotMode = resolveSelectorSnapshotMode(name);
            snapshotModeReady = true;
        }
        let nextSel: R;
        if (needsMutableSnapshot) {
            nextSel = selector(getMutableSelectorSnapshotForMode(_state, snapshotMode) as TState);
        } else {
            try {
                nextSel = selector(getFrozenSelectorSnapshotForMode(_state, snapshotMode) as TState);
            } catch (err) {
                if (!isMutationError(err)) throw err;
                needsMutableSnapshot = true;
                nextSel = selector(getMutableSelectorSnapshotForMode(_state, snapshotMode) as TState);
            }
        }
        if (!hasPrev) {
            const last = prevSel;
            hasPrev = true;
            prevSel = nextSel;
            listener(nextSel, last);
            return;
        }
        const matches = equality(nextSel, prevSel as R);
        if (!matches) {
            const last = prevSel;
            prevSel = nextSel;
            listener(nextSel, last);
        }
    };
    return subscribeSelectorStore(name, wrapped);
};
