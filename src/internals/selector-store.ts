/**
 * @module internals/selector-store
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/selector-store.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getCommittedStoreValueRef,
    getRegistry,
    hasStoreEntryInternal,
} from "../core/store-lifecycle/registry.js";
import type { StoreValue as SelectorStoreValue } from "../core/store-lifecycle/types.js";

type SelectorSubscriber = (value: SelectorStoreValue | null) => void;

export type { SelectorStoreValue };

export const hasSelectorStoreEntry = (name: string): boolean => {
    return hasStoreEntryInternal(name);
};

export const getSelectorStoreValueRef = (name: string): SelectorStoreValue | undefined => {
    return getCommittedStoreValueRef(name) as SelectorStoreValue | undefined;
};

export const subscribeSelectorStore = (name: string, fn: SelectorSubscriber): (() => void) => {
    const registry = getRegistry();
    const registrySubs = registry.subscribers;
    if (!registrySubs[name]) registrySubs[name] = new Set();
    registrySubs[name].add(fn);
    return () => {
        registrySubs[name]?.delete(fn);
        if (registrySubs[name]?.size === 0) delete registrySubs[name];
    };
};
