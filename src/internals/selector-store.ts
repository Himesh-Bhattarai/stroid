import {
    stores as _stores,
    subscribers as _subscribers,
    type StoreValue as SelectorStoreValue,
} from "../store-lifecycle.js";

type SelectorSubscriber = (value: SelectorStoreValue | null) => void;

export type { SelectorStoreValue };

export const hasSelectorStoreEntry = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(_stores, name);

export const getSelectorStoreValueRef = (name: string): SelectorStoreValue | undefined =>
    _stores[name];

export const subscribeSelectorStore = (name: string, fn: SelectorSubscriber): (() => void) => {
    if (!_subscribers[name]) _subscribers[name] = [];
    _subscribers[name].push(fn);
    return () => {
        const current = _subscribers[name];
        if (!current || current.length === 0) return;
        const index = current.indexOf(fn);
        if (index < 0) return;
        const next = current.slice();
        next.splice(index, 1);
        _subscribers[name] = next;
    };
};
