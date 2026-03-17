/**
 * @module internals/selector-store
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/selector-store.
 *
 * Consumers: Internal imports and public API.
 */
import {
    stores as _stores,
    getRegistry,
} from "../store-lifecycle/registry.js";
import type { StoreValue as SelectorStoreValue } from "../store-lifecycle/types.js";

type SelectorSubscriber = (value: SelectorStoreValue | null) => void;

export type { SelectorStoreValue };

export const hasSelectorStoreEntry = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(_stores, name);

export const getSelectorStoreValueRef = (name: string): SelectorStoreValue | undefined =>
    _stores[name];

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


