/**
 * @module store-admin-impl
 *
 * LAYER: Store runtime
 * OWNS:  delete/reset/clear admin operations.
 *
 * Consumers: store-admin.
 */
import { warn, deepClone } from "../utils.js";
import { getRegistry, getStoreAdmin } from "./store-lifecycle/registry.js";
import { invalidatePathCache, materializeInitial } from "./store-lifecycle/validation.js";
import { nameOf, exists, reportStoreWarning } from "./store-lifecycle/identity.js";
import type {
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    WriteResult,
} from "./store-lifecycle/types.js";
import { clearSsrGlobalAllowWarned } from "./store-create.js";
import { runTestResets } from "../internals/test-reset.js";
import {
    isTransactionActive,
    getStagedTransactionValue,
    markTransactionFailed,
} from "./store-transaction.js";
import { stageOrCommitUpdate, clearSlowMutatorWarnings, forgetSlowMutatorWarning } from "./store-write-shared.js";

export function deleteStore<Name extends string, State>(name: StoreDefinition<Name, State>): void;
export function deleteStore<Name extends string, State>(name: StoreKey<Name, State>): void;
export function deleteStore<Name extends StoreName>(name: Name): void;
export function deleteStore(nameInput: string | StoreDefinition<string, StoreValue>): void {
    const name = nameOf(nameInput);
    if (!exists(name)) return;
    const registry = getRegistry();
    if (!materializeInitial(name, registry)) return;
    if (isTransactionActive()) {
        const message =
            `deleteStore("${name}") cannot be called inside setStoreBatch. ` +
            `Move deleteStore outside the batch to preserve transaction semantics.`;
        reportStoreWarning(name, message);
        markTransactionFailed(message);
        return;
    }
    const admin = getStoreAdmin();
    admin.deleteExistingStore(name);
    invalidatePathCache(name);
    forgetSlowMutatorWarning(name);
    clearSsrGlobalAllowWarned(name);
}

export function resetStore<Name extends string, State>(name: StoreDefinition<Name, State>): WriteResult;
export function resetStore<Name extends string, State>(name: StoreKey<Name, State>): WriteResult;
export function resetStore<Name extends StoreName>(name: Name): WriteResult;
export function resetStore(nameInput: string | StoreDefinition<string, StoreValue>): WriteResult {
    const name = nameOf(nameInput);
    if (!exists(name)) return { ok: false, reason: "not-found" };
    const registry = getRegistry();
    const lazyPending = registry.metaEntries[name]?.options?.lazy === true && !!registry.initialFactories[name];
    if (lazyPending) {
        const message =
            `resetStore("${name}") cannot run on a lazy store before it is initialized. ` +
            `Read the store once (getStore) to materialize it before resetting.`;
        reportStoreWarning(name, message);
        if (isTransactionActive()) {
            markTransactionFailed(message);
        }
        return { ok: false, reason: "lazy-uninitialized" };
    }
    if (!materializeInitial(name, registry)) return { ok: false, reason: "validate" };
    if (!registry.initialStates[name]) {
        const message =
            `resetStore("${name}") has no initial state to reset to. ` +
            `If this is a lazy store, ensure it has been initialized before calling resetStore.`;
        reportStoreWarning(name, message);
        if (isTransactionActive()) {
            markTransactionFailed(message);
        }
        return { ok: false, reason: "not-found" };
    }
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : registry.stores[name];
    const resetValue = deepClone(registry.initialStates[name]);

    stageOrCommitUpdate(registry, {
        name,
        prev,
        next: resetValue,
        action: "reset",
        hookLabel: "onReset",
        logMessage: `Store "${name}" reset to initial state/value`,
    });
    return { ok: true };
}

export const clearAllStores = (): void => {
    if (isTransactionActive()) {
        const message = `clearAllStores() cannot be called inside setStoreBatch.`;
        warn(message);
        markTransactionFailed(message);
        return;
    }
    const admin = getStoreAdmin();
    admin.clearAllStores();
    clearSlowMutatorWarnings();
    clearSsrGlobalAllowWarned();
};

export const _hardResetAllStoresForTest = (): void => {
    runTestResets();
};
