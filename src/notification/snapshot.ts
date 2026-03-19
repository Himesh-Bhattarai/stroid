/**
 * @module notification/snapshot
 *
 * LAYER: Notification pipeline
 * OWNS:  Snapshot mode resolution and cloning.
 *
 * Consumers: notification/delivery.ts, store-notify.ts
 */
import { deepClone, shallowClone, isDev } from "../utils.js";
import { devDeepFreeze, devShallowFreeze } from "../utils/devfreeze.js";
import type { SnapshotMode } from "../adapters/options.js";
import type { StoreValue } from "../core/store-lifecycle/types.js";

export const resolveSnapshotMode = (
    metaEntry: { options?: { snapshot?: SnapshotMode } } | undefined,
    fallback: SnapshotMode
): SnapshotMode => {
    const mode = metaEntry?.options?.snapshot ?? fallback;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

export const cloneSnapshot = (value: StoreValue, mode: SnapshotMode): StoreValue => {
    if (mode === "ref") {
        if (!isDev()) return value;
        try {
            return devShallowFreeze(value);
        } catch {
            return value;
        }
    }
    if (mode === "shallow") {
        const next = shallowClone(value);
        if (!isDev()) return next;
        try {
            return devShallowFreeze(next);
        } catch {
            return next;
        }
    }
    const next = deepClone(value);
    if (!isDev()) return next;
    try {
        return devDeepFreeze(next);
    } catch {
        return next;
    }
};
