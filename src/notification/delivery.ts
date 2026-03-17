/**
 * @module notification/delivery
 *
 * LAYER: Notification pipeline
 * OWNS:  Delivering snapshots to subscribers (inline + chunked).
 *
 * Consumers: notification/index.ts
 */
import { warn } from "../utils.js";
import { getConfig } from "../internals/config.js";
import { getRequestCarrier, type StoreRegistry } from "../store-registry.js";
import type { SnapshotMode } from "../adapters/options.js";
import type { StoreValue, Subscriber } from "../store-lifecycle/types.js";
import { resolveSnapshotMode, cloneSnapshot } from "./snapshot.js";
import { createMetrics, recordMetrics, commitMetrics } from "./metrics.js";
import { scheduleChunk } from "./scheduler.js";
import { hasHook, fireHook } from "../core/lifecycle-hooks.js";
import type { FlushPlan } from "./priority.js";

export const deliverFlush = (
    registry: StoreRegistry,
    plan: FlushPlan,
    flushVersion: number,
    onComplete: () => void
): void => {
    const state = registry.notify;
    const { names, sliceSize, chunkDelayMs, runInline, prioritySet } = plan;
    const carrier = getRequestCarrier();
    const subscriberBuffer = state.subscriberBuffer as Subscriber[];
    const registryStores = registry.stores;
    const registrySubs = registry.subscribers;
    const registryMeta = registry.metaEntries;
    const registrySnapshotCache = registry.snapshotCache;
    const defaultSnapshotMode = getConfig().defaultSnapshotMode;
    const resolveMode = (name: string): SnapshotMode =>
        resolveSnapshotMode(registryMeta[name], defaultSnapshotMode);
    const getStoreValue = (name: string): StoreValue => {
        if (carrier && Object.prototype.hasOwnProperty.call(carrier, name)) {
            return carrier[name] as StoreValue;
        }
        return registryStores[name] as StoreValue;
    };
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    const hasBeforeHook = hasHook("beforeFlush");
    const hasAfterHook = hasHook("afterFlush");

    const fireBefore = (name: string): void => {
        if (!hasBeforeHook) return;
        fireHook("beforeFlush", name, { type: "beforeFlush" });
    };

    const fireAfter = (name: string, elapsedMs: number): void => {
        if (!hasAfterHook) return;
        fireHook("afterFlush", name, { type: "afterFlush", elapsedMs });
    };

    const fillSubscriberBuffer = (subs: Set<Subscriber>): Subscriber[] => {
        subscriberBuffer.length = 0;
        for (const sub of subs) subscriberBuffer.push(sub);
        return subscriberBuffer;
    };

    const finish = (): void => {
        onComplete();
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

            const metrics = createMetrics(registryMeta[name]?.metrics);
            fireBefore(name);
            const start = now();
            const subsArray = fillSubscriberBuffer(subs);
            for (const subscriber of subsArray) {
                try { subscriber(snapshot); }
                catch (err) { warn(`Subscriber for "${name}" threw: ${(err as { message?: string })?.message ?? err}`); }
            }
            const elapsed = now() - start;
            fireAfter(name, elapsed);

            recordMetrics(metrics, elapsed);
            commitMetrics(registryMeta[name], metrics);

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
        snapshot: StoreValue | null;
        version: number;
        notified: Set<Subscriber>;
        metrics: ReturnType<typeof createMetrics>;
        totalMs: number;
        beforeHooked: boolean;
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
            tasks.push({
                name,
                snapshot,
                version: storeVersion,
                notified: new Set(),
                metrics: createMetrics(registryMeta[name]?.metrics),
                totalMs: 0,
                beforeHooked: false,
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

            const subs = registrySubs[task.name];
            if (!subs || subs.size === 0) {
                if (queue.length === 0) {
                    done();
                    return;
                }
                scheduleChunk(processNext, chunkDelayMs);
                return;
            }

            if (!task.beforeHooked) {
                task.beforeHooked = true;
                fireBefore(task.name);
            }

            const start = now();
            let sent = 0;
            let versionChanged = false;
            const subsArray = fillSubscriberBuffer(subs);
            for (let index = 0; index < subsArray.length && sent < sliceSize; index += 1) {
                const subscriber = subsArray[index];
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

            let hasUnnotified = false;
            if (subs) {
                for (const sub of subs) {
                    if (!task.notified.has(sub)) {
                        hasUnnotified = true;
                        break;
                    }
                }
            }

            if (hasUnnotified) {
                queue.push(task);
            } else {
                recordMetrics(task.metrics, task.totalMs);
                commitMetrics(registryMeta[task.name], task.metrics);
                fireAfter(task.name, task.totalMs);
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
