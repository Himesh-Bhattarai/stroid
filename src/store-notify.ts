/**
 * @module store-notify
 *
 * LAYER: Subscriber Notification Engine
 * OWNS:  PubSub flushing, batching, chunked delivery, and snapshot caching.
 *
 * DOES NOT KNOW about: createStore(), features (persist/sync/devtools),
 *        validation logic, or path parsing.
 *
 * Consumers: store-write (calls notify()), hooks-core (calls subscribe/getSnapshot).
 */
import { deepClone, shallowClone, warn } from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";
import { getConfig } from "./internals/config.js";
import { beginTransaction, endTransaction, isTransactionActive } from "./store-transaction.js";
import {
    meta,
    subscribers,
    stores,
    snapshotCache,
    hasStoreEntryInternal,
    getStoreValueRef,
    getRegistry,
    type StoreValue,
    type Subscriber,
} from "./store-lifecycle.js";
import { getTopoOrderedComputeds } from "./computed-graph.js";
import type { SnapshotMode } from "./adapters/options.js";

const pendingNotifications = new Set<string>();
const pendingBuffer: string[] = [];
const orderedNames: string[] = [];
let notifyScheduled = false;
let batchDepth = 0;

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

const buildPendingOrder = (): { names: string[]; sliceSize: number; chunkDelayMs: number; runInline: boolean; prioritySet: Set<string> | null } => {
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

    const computedOrder = getTopoOrderedComputeds(orderedNames);
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

const flush = () => {
    const { names, sliceSize, chunkDelayMs, runInline, prioritySet } = buildPendingOrder();
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const finish = () => {
        notifyScheduled = false;
        if (pendingNotifications.size > 0) scheduleFlush();
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
                pendingNotifications.add(name);
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
                metrics: meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
                totalMs: 0,
            });
        }
        return tasks;
    };

    const priorityQueue = prioritySet ? buildQueue((name) => prioritySet.has(name)) : [];
    const regularQueue = buildQueue((name) => !prioritySet || !prioritySet.has(name));

    const runQueue = (queue: StoreTask[], done: () => void): void => {
        const processNext = (): void => {
            if (queue.length === 0) {
                done();
                return;
            }
            const task = queue.shift()!;
            const currentVersion = meta[task.name]?.updateCount ?? task.version;
            if (currentVersion !== task.version) {
                pendingNotifications.add(task.name);
                if (queue.length === 0) {
                    done();
                    return;
                }
                if (runInline) processNext();
                else scheduleChunk(processNext, chunkDelayMs);
                return;
            }
            const start = now();
            const endIndex = Math.min(task.index + sliceSize, task.subsArray.length);
            for (let i = task.index; i < endIndex; i++) {
                try { task.subsArray[i](task.snapshot); }
                catch (err) { warn(`Subscriber for "${task.name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            }
            task.totalMs += now() - start;
            task.index = endIndex;

            if (task.index < task.subsArray.length) {
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

const scheduleFlush = (): void => {
    if (notifyScheduled) return;
    notifyScheduled = true;
    if (typeof queueMicrotask === "function") queueMicrotask(flush);
    else Promise.resolve().then(flush);
};

export const notify = (name: string): void => {
    pendingNotifications.add(name);
    if (batchDepth === 0) scheduleFlush();
};

export const setStoreBatch = (fn: () => unknown): void => {
    if (typeof fn !== "function") {
        warn("setStoreBatch requires a synchronous function callback.");
        return;
    }
    if (Object.prototype.toString.call(fn) === "[object AsyncFunction]") {
        throw new Error("setStoreBatch does not support async functions. Move async work outside and batch only synchronous mutations.");
    }

    // A simple mutex to avoid overlapping batch scopes in async edge cases
    if (batchDepth === Number.POSITIVE_INFINITY) {
        throw new Error("setStoreBatch cannot reenter while another async batch is unwinding.");
    }

    batchDepth = Math.max(0, batchDepth + 1);
    const registry = getRegistry();
    beginTransaction(registry);
    let batchError: unknown;
    try {
        const result = fn();
        if (result && typeof (result as Promise<unknown>).then === "function") {
            batchError = new Error("setStoreBatch does not support promise-returning callbacks. Move async work outside and batch only synchronous mutations.");
        }
    } catch (err) {
        batchError = err;
    } finally {
        const txError = endTransaction(batchError, registry);
        batchDepth = Math.max(0, batchDepth - 1);
        if (batchError || txError) {
            pendingNotifications.clear();
            notifyScheduled = false;
        }
        if (batchDepth === 0 && pendingNotifications.size > 0) {
            scheduleFlush();
        }
        if (txError && !batchError) {
            batchError = txError;
        }
    }

    if (batchError) throw batchError;
};

export const subscribeStore = (name: string, fn: Subscriber): (() => void) => {
    if (!subscribers[name]) subscribers[name] = new Set();
    subscribers[name].add(fn);
    return () => {
        subscribers[name]?.delete(fn); // O(1)
        if (subscribers[name]?.size === 0) delete subscribers[name];
    };
};

// Backward compat alias
export const subscribeInternal = subscribeStore;
export const subscribe = subscribeStore;

export const getStoreSnapshot = (name: string): StoreValue | null => {
    if (!hasStoreEntryInternal(name)) return null;
    const version = meta[name]?.updateCount ?? 0;
    const snapshotMode = resolveSnapshotMode(name);
    const cached = snapshotCache[name];
    if (cached && cached.version === version) {
        const snap = cached.snapshot;
        maybeFreezeSnapshot(snap, snapshotMode);
        return snap;
    }
    if (isTransactionActive()) {
        const source = getStoreValueRef(name);
        if (source === undefined) return null;
        const snapshot = cloneSnapshot(source, snapshotMode);
        maybeFreezeSnapshot(snapshot, snapshotMode);
        return snapshot;
    }

    const source = getStoreValueRef(name);
    const snapshot = cloneSnapshot(source, snapshotMode);
    maybeFreezeSnapshot(snapshot, snapshotMode);
    snapshotCache[name] = { version, snapshot };
    return snapshot;
};
// Backward compat alias
export const getSnapshot = getStoreSnapshot;

export const resetNotifyStateForTests = (): void => {
    pendingNotifications.clear();
    notifyScheduled = false;
    batchDepth = 0;
};
