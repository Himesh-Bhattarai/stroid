/**
 * @module store-notify-scheduler
 *
 * LAYER: Store runtime
 * OWNS:  Notification scheduling, ordering, and flush coordination.
 *
 * Consumers: store-notify.ts
 */
import { deepClone, shallowClone, warn } from "./utils.js";
import { getConfig } from "./internals/config.js";
import { runWithRegistry, type StoreRegistry, type NotifyState, getRequestCarrier } from "./store-registry.js";
import { meta } from "./store-lifecycle/registry.js";
import type { StoreValue, Subscriber } from "./store-lifecycle/types.js";
import { getComputedOrder } from "./internals/computed-order.js";
import type { SnapshotMode } from "./adapters/options.js";

export const resolveSnapshotMode = (name: string): SnapshotMode => {
    const mode = meta[name]?.options?.snapshot ?? getConfig().defaultSnapshotMode;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

const resolveSnapshotModeForMeta = (metaEntry: { options?: { snapshot?: SnapshotMode } } | undefined, fallback: SnapshotMode): SnapshotMode => {
    const mode = metaEntry?.options?.snapshot ?? fallback;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

export const cloneSnapshot = (value: StoreValue, mode: SnapshotMode): StoreValue => {
    if (mode === "ref") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
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
    state.isFlushing = true;
    state.flushId = (state.flushId + 1) >>> 0;
    const flushVersion = state.flushId;
    const { names, sliceSize, chunkDelayMs, runInline, prioritySet } = buildPendingOrder(state);
    const carrier = getRequestCarrier();
    const registryStores = registry.stores;
    const registrySubs = registry.subscribers;
    const registryMeta = registry.metaEntries;
    const registrySnapshotCache = registry.snapshotCache;
    const defaultSnapshotMode = getConfig().defaultSnapshotMode;
    const getStoreValue = (name: string): StoreValue => {
        if (carrier && Object.prototype.hasOwnProperty.call(carrier, name)) {
            return carrier[name] as StoreValue;
        }
        return registryStores[name] as StoreValue;
    };
    const resolveMode = (name: string): SnapshotMode =>
        resolveSnapshotModeForMeta(registryMeta[name], defaultSnapshotMode);
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const finish = () => {
        state.isFlushing = false;
        state.notifyScheduled = false;
        if (state.pendingNotifications.size > 0) scheduleFlush(registry);
    };

    if (runInline) {
        for (const name of names) {
            const subs = registrySubs[name];
            if (!subs || subs.size === 0) continue;
            const storeVersion = registryMeta[name]?.updateCount ?? 0;
            const snapshotMode = resolveMode(name);
            const source = getStoreValue(name);
            const cached = registrySnapshotCache[name];
            const snapshot = (cached && cached.source === source && cached.mode === snapshotMode)
                ? cached.snapshot
                : (() => {
                    const nextSnapshot = cloneSnapshot(source, snapshotMode);
                    registrySnapshotCache[name] = { version: flushVersion, snapshot: nextSnapshot, source, mode: snapshotMode };
                    return nextSnapshot;
                })();

            const start = now();
            for (const subscriber of subs) {
                try { subscriber(snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            }
            const elapsed = now() - start;

            const metrics = registryMeta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += elapsed;
            metrics.lastNotifyMs = elapsed;
            if (registryMeta[name]) registryMeta[name].metrics = metrics;

            const currentVersion = registryMeta[name]?.updateCount ?? storeVersion;
            if (currentVersion !== storeVersion) {
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

    const fillSubscribers = (target: Subscriber[], subs: Set<Subscriber>): void => {
        target.length = 0;
        for (const sub of subs) target.push(sub);
    };
    const buildQueue = (filter?: (name: string) => boolean): StoreTask[] => {
        const tasks: StoreTask[] = [];
        for (const name of names) {
            if (filter && !filter(name)) continue;
            const subs = registrySubs[name];
            if (!subs || subs.size === 0) continue;
            const storeVersion = registryMeta[name]?.updateCount ?? 0;
            const snapshotMode = resolveMode(name);
            const source = getStoreValue(name);
            const cached = registrySnapshotCache[name];
            const snapshot = (cached && cached.source === source && cached.mode === snapshotMode)
                ? cached.snapshot
                : (() => {
                    const nextSnapshot = cloneSnapshot(source, snapshotMode);
                    registrySnapshotCache[name] = { version: flushVersion, snapshot: nextSnapshot, source, mode: snapshotMode };
                    return nextSnapshot;
                })();
            const subsArray: Subscriber[] = [];
            fillSubscribers(subsArray, subs);
            tasks.push({
                name,
                subsArray,
                index: 0,
                snapshot,
                version: storeVersion,
                notified: new Set(),
                metrics: registryMeta[name]?.metrics ? { ...registryMeta[name]!.metrics } : { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
                totalMs: 0,
            });
        }
        return tasks;
    };

    const priorityQueue = prioritySet ? buildQueue((name) => prioritySet.has(name)) : [];
    const regularQueue = buildQueue((name) => !prioritySet || !prioritySet.has(name));

    const refreshTaskSubscribers = (task: StoreTask): void => {
        const subs = registrySubs[task.name];
        if (!subs || subs.size === 0) {
            task.subsArray = [];
            task.index = 0;
            return;
        }
        fillSubscribers(task.subsArray, subs);
        task.index = 0;
    };

    const runQueue = (queue: StoreTask[], done: () => void): void => {
        const processNext = (): void => {
            if (queue.length === 0) {
                done();
                return;
            }
            const task = queue.shift()!;
            const currentVersion = registryMeta[task.name]?.updateCount ?? task.version;
            if (currentVersion !== task.version) {
                state.pendingNotifications.add(task.name);
                if (queue.length === 0) {
                    done();
                    return;
                }
                scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            refreshTaskSubscribers(task);
            if (task.subsArray.length === 0) {
                if (queue.length === 0) {
                    done();
                    return;
                }
                scheduleChunk(processNext, chunkDelayMs);
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
                const currentVersion = registryMeta[task.name]?.updateCount ?? task.version;
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
                scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            const currentSubs = registrySubs[task.name];
            let hasUnnotified = false;
            if (currentSubs) {
                for (const sub of currentSubs) {
                    if (!task.notified.has(sub)) {
                        hasUnnotified = true;
                        break;
                    }
                }
            }

            if (task.index < task.subsArray.length || hasUnnotified) {
                queue.push(task);
            } else {
                task.metrics.notifyCount += 1;
                task.metrics.totalNotifyMs += task.totalMs;
                task.metrics.lastNotifyMs = task.totalMs;
                if (registryMeta[task.name]) registryMeta[task.name].metrics = task.metrics;
            }

            if (queue.length === 0) {
                done();
                return;
            }
            scheduleChunk(processNext, chunkDelayMs);
        };

        processNext();
    };

    if (priorityQueue.length > 0) {
        runQueue(priorityQueue, () => runQueue(regularQueue, finish));
    } else {
        runQueue(regularQueue, finish);
    }
};

export const scheduleFlush = (registry: StoreRegistry): void => {
    const state = registry.notify;
    if (state.notifyScheduled) return;
    state.notifyScheduled = true;
    const run = () => runWithRegistry(registry, () => flush(registry));
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};
