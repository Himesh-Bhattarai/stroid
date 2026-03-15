/**
 * @fileoverview src\internals\selector-store.ts
 */
import {
    stores as _stores,
    subscribers as _subscribers,
} from "../store-lifecycle/registry.js";
import type { StoreValue as SelectorStoreValue } from "../store-lifecycle/types.js";

type SelectorSubscriber = (value: SelectorStoreValue | null) => void;

export type { SelectorStoreValue };

export const hasSelectorStoreEntry = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(_stores, name);

export const getSelectorStoreValueRef = (name: string): SelectorStoreValue | undefined =>
    _stores[name];

export const subscribeSelectorStore = (name: string, fn: SelectorSubscriber): (() => void) => {
    if (!_subscribers[name]) _subscribers[name] = new Set();
    _subscribers[name].add(fn);
    return () => {
        _subscribers[name]?.delete(fn);
        if (_subscribers[name]?.size === 0) delete _subscribers[name];
    };
};

