/**
 * @module notification/snapshot
 *
 * LAYER: Notification pipeline
 * OWNS:  Snapshot mode resolution and cloning.
 *
 * Consumers: notification/delivery.ts, store-notify.ts
 */
import { deepClone, shallowClone } from "../utils.js";
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
    if (mode === "ref") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};
