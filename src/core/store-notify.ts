/**
 * @module store-notify
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-notify.
 *
 * Consumers: Internal imports and public API.
 */
import { warn, warnAlways } from "../utils.js";
import { devDeepFreeze, devShallowFreeze } from "../utils/devfreeze.js";
import { beginTransaction, endTransaction, isTransactionActive } from "./store-transaction.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import {
    hasStoreEntryInternal,
    getCommittedStoreValueRef,
    getStoreValueRef,
    recordStoreRead,
    getRegistry,
} from "./store-lifecycle/registry.js";
import { runWithRegistry } from "./store-registry.js";
import type { StoreValue, Subscriber } from "./store-lifecycle/types.js";
import type { SnapshotMode } from "../adapters/options.js";
import { cloneSnapshot, resolveSnapshotMode } from "../notification/snapshot.js";
import { scheduleFlush } from "../notification/index.js";
import { getConfig } from "../internals/config.js";
import { registerNotifyHandler } from "./store-shared/notify.js";

const maybeFreezeSnapshot = (snapshot: StoreValue | null, mode: SnapshotMode): void => {
    if (!snapshot || typeof snapshot !== "object") return;
    if (mode === "ref" || mode === "shallow") {
        devShallowFreeze(snapshot);
        return;
    }
    if (mode === "deep") {
        devDeepFreeze(snapshot);
    }
};

export const notify = (name: string): void => {
    const registry = getRegistry();
    const state = registry.notify;
    state.pendingNotifications.add(name);
    if (state.batchDepth === 0) scheduleFlush(registry);
};

registerNotifyHandler(notify);

export const setStoreBatch = (fn: () => unknown): void => {
    if (typeof fn !== "function") {
        warn("setStoreBatch requires a synchronous function callback.");
        return;
    }
    const fnTag = Object.prototype.toString.call(fn);
    if (fnTag === "[object AsyncFunction]" || fnTag === "[object AsyncGeneratorFunction]") {
        warnAlways("setStoreBatch does not support async functions. Move async work outside and batch only synchronous mutations.");
        return;
    }
    if (fnTag === "[object GeneratorFunction]") {
        warnAlways("setStoreBatch does not support generator functions. Move generator logic outside and batch only synchronous mutations.");
        return;
    }

    const registry = getRegistry();
    const isServer = typeof window === "undefined";
    const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
    if (isServer && nodeEnv === "production" && registry.scope !== "request") {
        throw new Error(
            `setStoreBatch() called in a global SSR context. ` +
            `Use createStoreForRequest() to ensure transaction isolation.`
        );
    }
    const state = registry.notify;
    state.batchDepth = Math.max(0, state.batchDepth + 1);
    beginTransaction(registry);
    let batchError: unknown;
    try {
        const result = runWithRegistry(registry, fn);
        if (result && typeof (result as Promise<unknown>).then === "function") {
            batchError = new Error("setStoreBatch does not support promise-returning callbacks. Move async work outside and batch only synchronous mutations.");
        }
    } catch (err) {
        batchError = err;
    } finally {
        const txError = endTransaction(batchError, registry);
        state.batchDepth = Math.max(0, state.batchDepth - 1);
        if (state.batchDepth === 0 && state.pendingNotifications.size > 0) {
            scheduleFlush(registry);
        }
        if (txError && !batchError) {
            batchError = txError;
        }
    }

    if (batchError) {
        const message = batchError instanceof Error ? batchError.message : String(batchError);
        warnAlways(`setStoreBatch failed: ${message}`);
    }
};

export const subscribeStore = (name: string, fn: Subscriber): (() => void) => {
    const registry = getRegistry();
    const registrySubs = registry.subscribers;
    if (!registrySubs[name]) registrySubs[name] = new Set();
    registrySubs[name].add(fn);
    return () => {
        registrySubs[name]?.delete(fn); // O(1)
        if (registrySubs[name]?.size === 0) delete registrySubs[name];
    };
};

// Backward compat aliases
/** @deprecated Use subscribeStore instead. */
export const subscribeInternal = subscribeStore;
/** @deprecated Use subscribeStore instead. */
export const subscribe = subscribeStore;

const readStoreSnapshot = (
    name: string,
    options: {
        trackRead: boolean;
        committedOnly: boolean;
    }
): StoreValue | null => {
    if (!hasStoreEntryInternal(name)) return null;
    const registry = getRegistry();
    if (options.trackRead) {
        recordStoreRead(name, registry);
    }
    const snapshotMode = resolveSnapshotMode(
        registry.metaEntries[name],
        getConfig().defaultSnapshotMode
    );
    if (!options.committedOnly && isTransactionActive()) {
        const txCache = registry.transaction.snapshotCache;
        const source = getStoreValueRef(name);
        if (source === undefined) return null;
        const cached = txCache.get(name);
        if (cached && cached.source === source && cached.mode === snapshotMode) {
            const snap = cached.snapshot;
            maybeFreezeSnapshot(snap, snapshotMode);
            return snap;
        }
        const snapshot = cloneSnapshot(source, snapshotMode);
        txCache.set(name, { source, snapshot, mode: snapshotMode });
        maybeFreezeSnapshot(snapshot, snapshotMode);
        return snapshot;
    }

    const version = registry.notify.flushId;
    const source = options.committedOnly
        ? getCommittedStoreValueRef(name, registry)
        : getStoreValueRef(name, registry);
    const cached = registry.snapshotCache[name];
    if (cached && cached.source === source && cached.mode === snapshotMode) {
        const snap = cached.snapshot;
        maybeFreezeSnapshot(snap, snapshotMode);
        return snap;
    }

    const snapshot = cloneSnapshot(source, snapshotMode);
    maybeFreezeSnapshot(snapshot, snapshotMode);
    registry.snapshotCache[name] = { version, snapshot, source, mode: snapshotMode };
    return snapshot;
};

export const getStoreSnapshot = (name: string): StoreValue | null =>
    readStoreSnapshot(name, { trackRead: true, committedOnly: false });

export const getStoreSnapshotNoTrack = (name: string): StoreValue | null =>
    readStoreSnapshot(name, { trackRead: false, committedOnly: true });
// Backward compat alias
/** @deprecated Use getStoreSnapshot instead. */
export const getSnapshot = getStoreSnapshot;

export const resetNotifyStateForTests = (): void => {
    const state = getRegistry().notify;
    state.pendingNotifications.clear();
    state.pendingBuffer.length = 0;
    state.orderedNames.length = 0;
    state.notifyScheduled = false;
    state.batchDepth = 0;
};

registerTestResetHook("notify.reset", resetNotifyStateForTests, 40);


