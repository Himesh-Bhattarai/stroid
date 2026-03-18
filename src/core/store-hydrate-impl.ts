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
import { getRegistry, hasStoreEntryInternal } from "./store-lifecycle/registry.js";
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

type HydrateSnapshot = HydrateSnapshotFor<StoreStateMap & StrictStoreMap>;
type HydrateOptions<Snapshot extends object> =
    Partial<{ [K in keyof Snapshot]: StoreOptions<Snapshot[K]> }> & { default?: StoreOptions };
type HydrationTrustBase<Snapshot extends object> = {
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
type HydrationTrust<Snapshot extends object> =
    | (HydrationTrustBase<Snapshot> & { allowTrusted: true })
    | (HydrationTrustBase<Snapshot> & { allowHydration: true })
    | (HydrationTrustBase<Snapshot> & { allowUntrusted: true })
    | (HydrationTrustBase<Snapshot> & { validate: (snapshot: Snapshot) => boolean });

export const hydrateStores = <Snapshot extends object = HydrateSnapshot>(
    snapshot: Snapshot,
    options: HydrateOptions<Snapshot> = {},
    trust: HydrationTrust<Snapshot>
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
            ok = !!trustInput.validate(snapshot);
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
            }
        } else {
            const optionMap = options as Record<string, StoreOptions<any>> & { default?: StoreOptions<any> };
            const created = createStore(storeName, data, optionMap[storeName] || optionMap.default || {});
            if (created) {
                result.created.push(storeName);
                hydratedSources.push(storeName);
            }
            else result.failed.push({
                name: storeName,
                reason: "create-failed",
                received: data,
            });
        }
    });
    if (hydratedSources.length > 0) {
        // TODO: regression test for computed recompute after hydrateStores with out-of-order snapshot keys.
        const orderedComputeds = getTopoOrderedComputeds(hydratedSources);
        orderedComputeds.forEach((computedName) => {
            const entry = registry.computedEntries[computedName];
            if (!entry) return;
            const args = entry.deps.map((dep) => getStore(dep as any));
            try {
                const next = entry.compute(...args);
                if (next && typeof (next as any).then === "function") {
                    warn(`hydrateStores recompute for "${computedName}" returned a Promise; skipping.`);
                    return;
                }
                const current = getStore(computedName as any);
                if (Object.is(next, current)) return;
                replaceStore(computedName as any, next as StoreValue);
            } catch (err) {
                warn(`hydrateStores recompute for "${computedName}" failed: ${(err as { message?: string })?.message ?? err}`);
            }
        });
    }
    return result;
};
