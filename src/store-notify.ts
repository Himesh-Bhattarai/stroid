import { deepClone } from "./utils.js";
import { devDeepFreeze } from "./devfreeze.js";
import { getConfig } from "./internals/config.js";
import { warn } from "./utils.js";
import {
    meta,
    subscribers,
    stores,
    snapshotCache,
    hasStoreEntryInternal,
    type StoreValue,
    type Subscriber,
} from "./store-lifecycle.js";

const pendingNotifications = new Set<string>();
const pendingBuffer: string[] = [];
const orderedNames: string[] = [];
let notifyScheduled = false;
let batchDepth = 0;

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

const buildPendingOrder = (): { names: string[]; sliceSize: number; chunkDelayMs: number; runInline: boolean } => {
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

    const sliceSize = Number.isFinite(cfg.chunkSize) && (cfg.chunkSize as number) > 0
        ? (cfg.chunkSize as number)
        : Number.POSITIVE_INFINITY;
    const chunkDelayMs = cfg.chunkDelayMs;
    const runInline = sliceSize === Number.POSITIVE_INFINITY && chunkDelayMs === 0;
    return { names: orderedNames, sliceSize, chunkDelayMs, runInline };
};

const flush = () => {
    const { names, sliceSize, chunkDelayMs, runInline } = buildPendingOrder();
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const finish = () => {
        notifyScheduled = false;
        if (pendingNotifications.size > 0) scheduleFlush();
    };

    let nameIndex = 0;
    const processStore = (): void => {
        if (nameIndex >= names.length) {
            finish();
            return;
        }
        const name = names[nameIndex++];
        const subs = subscribers[name];
        if (!subs || subs.length === 0) {
            processStore();
            return;
        }

        const snapshot = deepClone(stores[name]);
        const start = now();
        const metrics = meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };

        const flushChunk = (offset: number): void => {
            const endIndex = Math.min(offset + sliceSize, subs.length);
            for (let i = offset; i < endIndex; i++) {
                try { subs[i](snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            }
            if (endIndex < subs.length) {
                scheduleChunk(() => flushChunk(endIndex), chunkDelayMs);
                return;
            }
            const delta = now() - start;
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += delta;
            metrics.lastNotifyMs = delta;
            if (meta[name]) meta[name].metrics = metrics;
            if (runInline) processStore();
            else scheduleChunk(processStore, chunkDelayMs);
        };

        flushChunk(0);
    };

    processStore();
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
        throw new Error("setStoreBatch requires a synchronous function callback.");
    }
    if ((fn as any)?.constructor?.name === "AsyncFunction") {
        throw new Error("setStoreBatch does not accept async/await functions. Move async work outside and batch only synchronous mutations.");
    }
    const savedNotifications = new Set(pendingNotifications);

    // A simple mutex to avoid overlapping batch scopes in async edge cases
    if (batchDepth === Number.POSITIVE_INFINITY) {
        throw new Error("setStoreBatch cannot reenter while another async batch is unwinding.");
    }

    batchDepth = Math.max(0, batchDepth + 1);
    try {
        const result = fn();
        if (result && typeof (result as Promise<unknown>).then === "function") {
            pendingNotifications.clear();
            savedNotifications.forEach((n) => pendingNotifications.add(n));
            throw new Error("setStoreBatch detected a promise-returning callback after mutations ran. Perform async work outside the batch and keep the batched section synchronous.");
        }
    } finally {
        batchDepth = Math.max(0, batchDepth - 1);
        if (batchDepth === 0 && pendingNotifications.size > 0) {
            scheduleFlush();
        }
    }
};

export const subscribeStore = (name: string, fn: Subscriber): (() => void) => {
    if (!subscribers[name]) subscribers[name] = [];
    subscribers[name].push(fn);
    return () => {
        const current = subscribers[name];
        if (!current || current.length === 0) return;
        const index = current.indexOf(fn);
        if (index < 0) return;
        const next = current.slice();
        next.splice(index, 1);
        subscribers[name] = next;
    };
};

// Backward compat alias
export const subscribeInternal = subscribeStore;
export const subscribe = subscribeStore;

export const getStoreSnapshot = (name: string): StoreValue | null => {
    if (!hasStoreEntryInternal(name)) return null;
    const source = stores[name];
    const cached = snapshotCache[name];
    if (cached && cached.source === source) return cached.snapshot;
    const snapshot = deepClone(source);
    const safeSnapshot = snapshot && typeof snapshot === "object"
        ? devDeepFreeze(snapshot)
        : snapshot;
    snapshotCache[name] = { source, snapshot: safeSnapshot };
    return safeSnapshot;
};
// Backward compat alias
export const getSnapshot = getStoreSnapshot;

export const resetNotifyStateForTests = (): void => {
    pendingNotifications.clear();
    notifyScheduled = false;
    batchDepth = 0;
};
