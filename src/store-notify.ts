/**
 * @fileoverview src\store-notify.ts
 */
import { deepClone, shallowClone, warn, warnAlways } from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";
import { getConfig } from "./internals/config.js";
import { beginTransaction, endTransaction, isTransactionActive } from "./store-transaction.js";
import { runWithRegistry, type StoreRegistry, type NotifyState } from "./store-registry.js";
import { registerTestResetHook } from "./internals/test-reset.js";
import {
    meta,
    subscribers,
    stores,
    snapshotCache,
    hasStoreEntryInternal,
    getStoreValueRef,
    getRegistry,
} from "./store-lifecycle/registry.js";
import type { StoreValue, Subscriber } from "./store-lifecycle/types.js";
import { getComputedOrder } from "./internals/computed-order.js";
import type { SnapshotMode } from "./adapters/options.js";

const resolveSnapshotMode = (name: string): SnapshotMode => {
    const mode = meta[name]?.options?.snapshot ?? getConfig().defaultSnapshotMode;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

const cloneSnapshot = (value: StoreValue, mode: SnapshotMode): StoreValue => {
    if (mode === "ref") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};

const maybeFreezeSnapshot = (snapshot: StoreValue | null, mode: SnapshotMode): void => {
    if (mode !== "deep" && mode !== "ref") return;
    if (snapshot && typeof snapshot === "object") devDeepFreeze(snapshot);
};

const scheduleChunk = (fn: () => void, delayMs: number): void => {
    if (delayMs > 0 && typeof setTimeout === "function") {
        setTimeout(fn, delayMs);
        return;
    }
    if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
        return;
    }
    Promise.resolve().then(fn);
};

const buildPendingOrder = (state: NotifyState): { names: string[]; sliceSize: number; chunkDelayMs: number; runInline: boolean; prioritySet: Set<string> | null } => {
    const { pendingNotifications, pendingBuffer, orderedNames } = state;
    pendingBuffer.length = 0;
    for (const name of pendingNotifications) pendingBuffer.push(name);
    pendingNotifications.clear();

    const cfg = getConfig().flush;
    const priority = cfg.priorityStores || [];
    const pendingSet = new Set(pendingBuffer);
    const prioritySet = priority.length ? new Set(priority) : null;

    orderedNames.length = 0;
    if (prioritySet) {
        for (const p of priority) {
            if (pendingSet.has(p)) orderedNames.push(p);
        }
        for (const name of pendingBuffer) {
            if (!prioritySet.has(name)) orderedNames.push(name);
        }
    } else {
        orderedNames.push(...pendingBuffer);
    }

    const computedOrder = getComputedOrder(orderedNames);
    const orderedSet = new Set(orderedNames);
    for (const computedName of computedOrder) {
        if (pendingSet.has(computedName) && !orderedSet.has(computedName)) {
            orderedNames.push(computedName);
            orderedSet.add(computedName);
        }
    }

    const sliceSize = Number.isFinite(cfg.chunkSize) && (cfg.chunkSize as number) > 0
        ? (cfg.chunkSize as number)
        : Number.POSITIVE_INFINITY;
    const chunkDelayMs = cfg.chunkDelayMs;
    const runInline = sliceSize === Number.POSITIVE_INFINITY && chunkDelayMs === 0;
    const names = orderedNames.slice();
    return { names, sliceSize, chunkDelayMs, runInline, prioritySet };
};

const flush = (registry: StoreRegistry): void => {
    const state = registry.notify;
    const { names, sliceSize, chunkDelayMs, runInline, prioritySet } = buildPendingOrder(state);
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const finish = () => {
        state.notifyScheduled = false;
        if (state.pendingNotifications.size > 0) scheduleFlush(registry);
    };

    if (runInline) {
        for (const name of names) {
            const subs = subscribers[name];
            if (!subs || subs.size === 0) continue;
            const version = meta[name]?.updateCount ?? 0;
            const snapshotMode = resolveSnapshotMode(name);
            const cached = snapshotCache[name];
            const snapshot = (cached && cached.version === version)
                ? cached.snapshot
                : (() => {
                    const nextSnapshot = cloneSnapshot(stores[name], snapshotMode);
                    snapshotCache[name] = { version, snapshot: nextSnapshot };
                    return nextSnapshot;
                })();

            const start = now();
            for (const subscriber of subs) {
                try { subscriber(snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            }
            const elapsed = now() - start;

            const metrics = meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += elapsed;
            metrics.lastNotifyMs = elapsed;
            if (meta[name]) meta[name].metrics = metrics;

            const currentVersion = meta[name]?.updateCount ?? version;
            if (currentVersion !== version) {
                state.pendingNotifications.add(name);
            }
        }
        finish();
        return;
    }

    type StoreTask = {
        name: string;
        subsArray: Subscriber[];
        index: number;
        snapshot: StoreValue | null;
        version: number;
        notified: Set<Subscriber>;
        metrics: { notifyCount: number; totalNotifyMs: number; lastNotifyMs: number };
        totalMs: number;
    };

    const buildQueue = (filter?: (name: string) => boolean): StoreTask[] => {
        const tasks: StoreTask[] = [];
        for (const name of names) {
            if (filter && !filter(name)) continue;
            const subs = subscribers[name];
            if (!subs || subs.size === 0) continue;
            const version = meta[name]?.updateCount ?? 0;
            const snapshotMode = resolveSnapshotMode(name);
            const cached = snapshotCache[name];
            const snapshot = (cached && cached.version === version)
                ? cached.snapshot
                : (() => {
                    const nextSnapshot = cloneSnapshot(stores[name], snapshotMode);
                    snapshotCache[name] = { version, snapshot: nextSnapshot };
                    return nextSnapshot;
                })();
            tasks.push({
                name,
                subsArray: Array.from(subs),
                index: 0,
                snapshot,
                version,
                notified: new Set(),
                metrics: meta[name]?.metrics ? { ...meta[name]!.metrics } : { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
                totalMs: 0,
            });
        }
        return tasks;
    };

    const priorityQueue = prioritySet ? buildQueue((name) => prioritySet.has(name)) : [];
    const regularQueue = buildQueue((name) => !prioritySet || !prioritySet.has(name));

    const refreshTaskSubscribers = (task: StoreTask): void => {
        const subs = subscribers[task.name];
        if (!subs || subs.size === 0) {
            task.subsArray = [];
            task.index = 0;
            return;
        }
        task.subsArray = Array.from(subs);
        task.index = 0;
    };

    const runQueue = (queue: StoreTask[], done: () => void): void => {
        const processNext = (): void => {
            if (queue.length === 0) {
                done();
                return;
            }
            const task = queue.shift()!;
            const currentVersion = meta[task.name]?.updateCount ?? task.version;
            if (currentVersion !== task.version) {
                state.pendingNotifications.add(task.name);
                if (queue.length === 0) {
                    done();
                    return;
                }
                if (runInline) processNext();
                else scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            refreshTaskSubscribers(task);
            if (task.subsArray.length === 0) {
                if (queue.length === 0) {
                    done();
                    return;
                }
                if (runInline) processNext();
                else scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            const start = now();
            let sent = 0;
            let versionChanged = false;
            while (task.index < task.subsArray.length && sent < sliceSize) {
                const subscriber = task.subsArray[task.index++];
                if (task.notified.has(subscriber)) continue;
                task.notified.add(subscriber);
                try { subscriber(task.snapshot); }
                catch (err) { warn(`Subscriber for "${task.name}" threw: ${(err as { message?: string })?.message ?? err}`); }
                sent += 1;
                const currentVersion = meta[task.name]?.updateCount ?? task.version;
                if (currentVersion !== task.version) {
                    versionChanged = true;
                    state.pendingNotifications.add(task.name);
                    break;
                }
            }
            task.totalMs += now() - start;

            if (versionChanged) {
                if (queue.length === 0) {
                    done();
                    return;
                }
                if (runInline) processNext();
                else scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            const currentSubs = subscribers[task.name];
            const hasUnnotified = currentSubs
                ? Array.from(currentSubs).some((sub) => !task.notified.has(sub))
                : false;

            if (task.index < task.subsArray.length || hasUnnotified) {
                queue.push(task);
            } else {
                task.metrics.notifyCount += 1;
                task.metrics.totalNotifyMs += task.totalMs;
                task.metrics.lastNotifyMs = task.totalMs;
                if (meta[task.name]) meta[task.name].metrics = task.metrics;
            }

            if (queue.length === 0) {
                done();
                return;
            }
            if (runInline) processNext();
            else scheduleChunk(processNext, chunkDelayMs);
        };

        processNext();
    };

    if (priorityQueue.length > 0) {
        runQueue(priorityQueue, () => runQueue(regularQueue, finish));
    } else {
        runQueue(regularQueue, finish);
    }
};

const scheduleFlush = (registry: StoreRegistry): void => {
    const state = registry.notify;
    if (state.notifyScheduled) return;
    state.notifyScheduled = true;
    const run = () => runWithRegistry(registry, () => flush(registry));
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};

export const notify = (name: string): void => {
    const registry = getRegistry();
    const state = registry.notify;
    state.pendingNotifications.add(name);
    if (state.batchDepth === 0) scheduleFlush(registry);
};

export const setStoreBatch = (fn: () => unknown): void => {
    if (typeof fn !== "function") {
        warn("setStoreBatch requires a synchronous function callback.");
        return;
    }
    if (Object.prototype.toString.call(fn) === "[object AsyncFunction]") {
        warnAlways("setStoreBatch does not support async functions. Move async work outside and batch only synchronous mutations.");
        return;
    }

    const registry = getRegistry();
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
        if (batchError || txError) {
            state.pendingNotifications.clear();
            state.notifyScheduled = false;
        }
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
    if (!subscribers[name]) subscribers[name] = new Set();
    subscribers[name].add(fn);
    return () => {
        subscribers[name]?.delete(fn); // O(1)
        if (subscribers[name]?.size === 0) delete subscribers[name];
    };
};

// Backward compat aliases
/** @deprecated Use subscribeStore instead. */
export const subscribeInternal = subscribeStore;
/** @deprecated Use subscribeStore instead. */
export const subscribe = subscribeStore;

export const getStoreSnapshot = (name: string): StoreValue | null => {
    if (!hasStoreEntryInternal(name)) return null;
    const snapshotMode = resolveSnapshotMode(name);
    if (isTransactionActive()) {
        const registry = getRegistry();
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

    const version = meta[name]?.updateCount ?? 0;
    const cached = snapshotCache[name];
    if (cached && cached.version === version) {
        const snap = cached.snapshot;
        maybeFreezeSnapshot(snap, snapshotMode);
        return snap;
    }

    const source = getStoreValueRef(name);
    const snapshot = cloneSnapshot(source, snapshotMode);
    maybeFreezeSnapshot(snapshot, snapshotMode);
    snapshotCache[name] = { version, snapshot };
    return snapshot;
};
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

