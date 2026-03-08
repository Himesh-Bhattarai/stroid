import {
    getStoreRegistry,
    hasStoreEntry,
    normalizeStoreRegistryScope,
    type RegistryStoreValue,
    type RegistrySubscriber,
} from "../store-registry.js";

const _registry = getStoreRegistry(normalizeStoreRegistryScope(new URL("../store.js", import.meta.url).href));

export type SelectorStoreValue = RegistryStoreValue;
type SelectorSubscriber = RegistrySubscriber;

export const hasSelectorStoreEntry = (name: string): boolean =>
    hasStoreEntry(_registry, name);

export const getSelectorStoreValueRef = (name: string): SelectorStoreValue | undefined =>
    _registry.stores[name];

export const subscribeSelectorStore = (name: string, fn: SelectorSubscriber): (() => void) => {
    if (!_registry.subscribers[name]) _registry.subscribers[name] = [];
    _registry.subscribers[name].push(fn);
    return () => {
        const current = _registry.subscribers[name];
        if (!current || current.length === 0) return;
        const index = current.indexOf(fn);
        if (index < 0) return;
        const next = current.slice();
        next.splice(index, 1);
        _registry.subscribers[name] = next;
    };
};
