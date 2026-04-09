/**
 * @module store-hydrate-impl
 *
 * LAYER: Store runtime
 * OWNS:  hydrateStores implementation.
 *
 * Consumers: store-hydrate.
 */
import { warn, warnAlways, isDev, isValidStoreName } from "../utils.js";
import { type StoreOptions } from "../adapters/options.js";
import { getCommittedStoreValueRef, getRegistry, hasStoreEntryInternal } from "./store-lifecycle/registry.js";
import type {
    StoreStateMap,
    StrictStoreMap,
    HydrateSnapshotFor,
    HydrationResult,
    StoreValue,
} from "./store-lifecycle/types.js";
import { getConfig } from "../internals/config.js";
import { createStore } from "./store-create.js";
import { isTransactionActive, markTransactionFailed } from "./store-transaction.js";
import { getStore } from "./store-read.js";
import { getTopoOrderedComputeds } from "../computed/computed-graph.js";
import { replaceStore, replaceStoreState } from "./store-replace-impl.js";
import { createRootSetRuntimePatch, setLastRuntimePatches } from "./runtime-patch.js";
import type { RuntimePatch } from "./runtime-patch.js";
import { store } from "./store-name.js";
import {
    initializeHydrationConsistency,
    type HydrationConsistencyOptions,
} from "./hydration-consistency.js";

const AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES = 256 * 1024;
const AUTO_QUEUE_BOOT_WINDOW_MS = 1;

export type HydrateSnapshot = HydrateSnapshotFor<StoreStateMap & StrictStoreMap>;
export type HydrateOptions<Snapshot extends object> =
    Partial<{ [K in keyof Snapshot]: StoreOptions<Snapshot[K]> }> & { default?: StoreOptions };
export type HydrationTrustBase<Snapshot extends object> = {
    /**
     * Explicitly trust this snapshot and allow hydration.
     */
    allowTrusted?: boolean;
    /**
     * Alias for allowTrusted.
     */
    allowHydration?: boolean;
    /**
     * @deprecated Use allowTrusted instead.
     */
    allowUntrusted?: boolean;
    validate?: (snapshot: Snapshot) => boolean;
    onValidationError?: (error: unknown, snapshot: Snapshot) => boolean;
};
export type HydrationTrust<Snapshot extends object> =
    | (HydrationTrustBase<Snapshot> & { allowTrusted: true })
    | (HydrationTrustBase<Snapshot> & { allowHydration: true })
    | (HydrationTrustBase<Snapshot> & { allowUntrusted: true })
    | (HydrationTrustBase<Snapshot> & { validate: (snapshot: Snapshot) => boolean });

const estimateUtf8LengthBounded = (value: string, limit: number): number => {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code <= 0x7F) {
            bytes += 1;
        } else if (code <= 0x7FF) {
            bytes += 2;
        } else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length) {
            const next = value.charCodeAt(index + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                bytes += 4;
                index += 1;
            } else {
                bytes += 3;
            }
        } else {
            bytes += 3;
        }
        if (bytes >= limit) {
            return limit;
        }
    }
    return bytes;
};

const estimateRoughJsonBytesBounded = (
    value: unknown,
    limit: number,
    stack = new WeakSet<object>(),
    inArray = false
): number => {
    if (limit <= 0) return 0;
    if (value === null) return Math.min(4, limit);

    const valueType = typeof value;
    if (valueType === "string") {
        return Math.min(limit, estimateUtf8LengthBounded(value as string, limit) + 2);
    }
    if (valueType === "number") {
        if (!Number.isFinite(value as number)) return Math.min(4, limit);
        return Math.min(String(value).length, limit);
    }
    if (valueType === "boolean") return Math.min((value as boolean) ? 4 : 5, limit);
    if (valueType === "bigint") return limit;
    if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
        return inArray ? Math.min(4, limit) : 0;
    }
    if (valueType !== "object") return 0;

    const objectValue = value as object;
    if (stack.has(objectValue)) return limit;
    if (objectValue instanceof Date) {
        return Math.min(Number.isNaN(objectValue.getTime()) ? 4 : 26, limit);
    }
    if (ArrayBuffer.isView(objectValue)) {
        return Math.min((objectValue as ArrayBufferView).byteLength + 16, limit);
    }
    if (objectValue instanceof ArrayBuffer) {
        return Math.min(objectValue.byteLength + 16, limit);
    }
    if (objectValue instanceof Map || objectValue instanceof Set) {
        return Math.min(2, limit);
    }

    let descriptors: Record<string, PropertyDescriptor>;
    try {
        descriptors = Object.getOwnPropertyDescriptors(objectValue as Record<string, unknown>);
    } catch {
        return limit;
    }

    stack.add(objectValue);
    try {
        if (Array.isArray(objectValue)) {
            const arrayValue = objectValue as unknown[];
            let total = 2;
            for (let index = 0; index < arrayValue.length; index += 1) {
                if (index > 0) {
                    total += 1;
                    if (total >= limit) return limit;
                }
                const hasIndex = Object.prototype.hasOwnProperty.call(arrayValue, index);
                const nextValue = hasIndex ? arrayValue[index] : null;
                const valueBytes = estimateRoughJsonBytesBounded(nextValue, limit - total, stack, true);
                total += valueBytes;
                if (total >= limit) return limit;
            }
            return total;
        }

        let total = 2;
        let firstProperty = true;
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (!descriptor.enumerable) continue;
            if ("get" in descriptor || "set" in descriptor) {
                return limit;
            }
            const descriptorValue = "value" in descriptor ? descriptor.value : undefined;
            const valueBytes = estimateRoughJsonBytesBounded(descriptorValue, limit - total, stack, false);
            if (valueBytes === 0) continue;
            const keyBytes = estimateUtf8LengthBounded(key, limit - total);
            const propertyPrefix = (firstProperty ? 0 : 1) + keyBytes + 3;
            total += propertyPrefix;
            if (total >= limit) return limit;
            total += valueBytes;
            if (total >= limit) return limit;
            firstProperty = false;
        }
        return total;
    } finally {
        stack.delete(objectValue);
    }
};

const estimateHydrationEntryBytes = (value: unknown): number => {
    if (typeof value === "string") return value.length;
    const roughBytes = estimateRoughJsonBytesBounded(value, AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES);
    if (roughBytes >= AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES) {
        return AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES;
    }
    try {
        const serialized = JSON.stringify(value);
        return typeof serialized === "string" ? serialized.length : 0;
    } catch {
        // Conservative fallback: assume "large" so we prefer the safer queued path.
        return AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES;
    }
};

export const estimateHydrationEntryBytesForTests = (value: unknown): number =>
    estimateHydrationEntryBytes(value);

const shouldAutoQueueLargeHydration = <Snapshot extends object>(
    snapshot: Snapshot,
    consistency?: HydrationConsistencyOptions<Snapshot>
): boolean => {
    if (!consistency) return false;
    if (consistency.bootWindow !== undefined || consistency.bootWindowMs !== undefined) return false;
    let totalBytes = 0;
    const values = Object.values(snapshot as Record<string, unknown>);
    for (let index = 0; index < values.length; index += 1) {
        totalBytes += estimateHydrationEntryBytes(values[index]);
        if (totalBytes >= AUTO_QUEUE_HYDRATION_THRESHOLD_BYTES) {
            return true;
        }
    }
    return false;
};

const resolveHydrationConsistencyOptions = <Snapshot extends object>(
    snapshot: Snapshot,
    consistency?: HydrationConsistencyOptions<Snapshot>
): HydrationConsistencyOptions<Snapshot> | undefined => {
    if (!shouldAutoQueueLargeHydration(snapshot, consistency)) return consistency;
    return {
        ...consistency,
        bootWindow: {
            mode: "timer",
            ms: AUTO_QUEUE_BOOT_WINDOW_MS,
        },
    };
};

export const hydrateStores = <Snapshot extends object = HydrateSnapshot>(
    snapshot: Snapshot,
    options: HydrateOptions<Snapshot> = {},
    trust: HydrationTrust<Snapshot>,
    consistency?: HydrationConsistencyOptions<Snapshot>
): HydrationResult => {
    if (isTransactionActive()) {
        const message = `hydrateStores(...) cannot be called inside setStoreBatch.`;
        warn(message);
        markTransactionFailed(message);
        return {
            hydrated: [],
            created: [],
            failed: [],
            blocked: { reason: "transaction" },
        };
    }
    const result: HydrationResult = {
        hydrated: [],
        created: [],
        failed: [],
    };
    if (!snapshot || typeof snapshot !== "object") return result;
    const registry = getRegistry();
    const runtimePatches: RuntimePatch[] = [];

    const trustInput = trust ?? {};
    const allowHydration =
        trustInput.allowTrusted === true ||
        trustInput.allowHydration === true ||
        trustInput.allowUntrusted === true ||
        getConfig().allowUntrustedHydration === true;
    if (!allowHydration) {
        warnAlways(
            `hydrateStores(...) requires explicit trust. ` +
            `Pass { allowTrusted: true } (or { allowHydration: true }) as the third argument ` +
            `or configureStroid({ allowTrustedHydration: true }).`
        );
        result.blocked = { reason: "untrusted" };
        return result;
    }
    if (typeof trustInput.validate === "function") {
        let ok = false;
        try {
            const validationResult = trustInput.validate(snapshot);
            if (
                validationResult
                && typeof validationResult === "object"
                && typeof (validationResult as PromiseLike<unknown>).then === "function"
            ) {
                const asyncMessage =
                    `hydrateStores() trust.validate must return a boolean synchronously. ` +
                    `Async validators are not supported in hydrateStores().`;
                if (isDev()) {
                    throw new Error(asyncMessage);
                }
                warnAlways(asyncMessage);
                result.blocked = { reason: "validation-error", cause: new Error(asyncMessage) };
                return result;
            }
            ok = !!validationResult;
        } catch (err) {
            const errorMessage =
                `hydrateStores() trust.validate threw: ${(err as { message?: string })?.message ?? err}`;
            if (isDev()) {
                throw new Error(
                    `hydrateStores() trust.validate threw an error. ` +
                    `Fix your validator before this becomes a silent production failure.\n` +
                    `Original error: ${(err as { message?: string })?.message ?? err}`
                );
            }
            const onError = options?.default?.onError;
            if (typeof onError === "function") {
                try {
                    onError(errorMessage);
                } catch (hookErr) {
                    warnAlways(
                        `hydrateStores(...) onError threw: ${(hookErr as { message?: string })?.message ?? hookErr}`
                    );
                }
            }
            warnAlways(errorMessage);
            if (typeof trustInput.onValidationError === "function") {
                try {
                    const allow = !!trustInput.onValidationError(err, snapshot);
                    if (allow) {
                        ok = true;
                    } else {
                        result.blocked = { reason: "validation-error", cause: err };
                        return result;
                    }
                } catch (hookErr) {
                    warnAlways(
                        `hydrateStores(...) onValidationError threw: ${(hookErr as { message?: string })?.message ?? hookErr}`
                    );
                    result.blocked = { reason: "validation-error", cause: hookErr };
                    return result;
                }
            } else {
                result.blocked = { reason: "validation-error", cause: err };
                return result;
            }
        }
        if (!ok) {
            warnAlways("hydrateStores(...) rejected by trust validation.");
            result.blocked = { reason: "validation-failed" };
            return result;
        }
    }
    const hydratedSources: string[] = [];
    Object.entries(snapshot).forEach(([storeName, data]) => {
        if (!isValidStoreName(storeName)) {
            result.failed.push({
                name: storeName,
                reason: "invalid-name",
            });
            return;
        }
        if (hasStoreEntryInternal(storeName, registry)) {
            const res = replaceStoreState(registry, storeName, data, "hydrate");
            if (!res.ok) {
                result.failed.push({
                    name: storeName,
                    reason: "merge-failed",
                    cause: res.reason,
                    received: data,
                });
            }
            else {
                result.hydrated.push(storeName);
                hydratedSources.push(storeName);
                runtimePatches.push(
                    createRootSetRuntimePatch({
                        store: storeName,
                        value: getCommittedStoreValueRef(storeName, registry),
                        source: "hydrateStores",
                    })
                );
            }
        } else {
            const optionMap = options as Record<string, StoreOptions<unknown>> & { default?: StoreOptions<unknown> };
            const created = createStore(storeName, data, optionMap[storeName] || optionMap.default || {});
            if (created) {
                result.created.push(storeName);
                hydratedSources.push(storeName);
                runtimePatches.push(
                    createRootSetRuntimePatch({
                        store: storeName,
                        value: getCommittedStoreValueRef(storeName, registry),
                        source: "hydrateStores",
                    })
                );
            }
            else result.failed.push({
                name: storeName,
                reason: "create-failed",
                received: data,
            });
        }
    });
    if (hydratedSources.length > 0) {
        const orderedComputeds = getTopoOrderedComputeds(hydratedSources);
        orderedComputeds.forEach((computedName) => {
            const entry = registry.computedEntries[computedName];
            if (!entry) return;
            const args = entry.deps.map((dep) => getStore(store(dep)));
            try {
                const next = entry.compute(...args);
                if (next && typeof (next as PromiseLike<unknown>).then === "function") {
                    warn(`hydrateStores recompute for "${computedName}" returned a Promise; skipping.`);
                    return;
                }
                const current = getCommittedStoreValueRef(computedName, registry);
                const unchangedByRawComputeIdentity = entry.hasLastOutput && Object.is(next, entry.lastOutput);
                if (unchangedByRawComputeIdentity || Object.is(next, current)) return;
                entry.lastOutput = next;
                entry.hasLastOutput = true;
                replaceStore(store(computedName), next as StoreValue);
            } catch (err) {
                warn(`hydrateStores recompute for "${computedName}" failed: ${(err as { message?: string })?.message ?? err}`);
            }
        });
    }
    if (runtimePatches.length > 0) {
        setLastRuntimePatches(runtimePatches, registry);
    }
    const resolvedConsistency = resolveHydrationConsistencyOptions(snapshot, consistency);
    const bootWindow = initializeHydrationConsistency(registry, snapshot, resolvedConsistency);
    if (bootWindow) {
        result.bootWindow = bootWindow;
    }
    return result;
};
