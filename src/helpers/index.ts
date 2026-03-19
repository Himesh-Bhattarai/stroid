/**
 * @module helpers
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for helpers.
 *
 * Consumers: Internal imports and public API.
 */
import { createStore } from "../core/store-create.js";
import { setStore, resetStore } from "../core/store-write.js";
import { getStore } from "../core/store-read.js";
import { store } from "../core/store-name.js";
import type { StoreOptions } from "../adapters/options.js";

let entityIdCounter = 0;

export const createCounterStore = (name: string, initial = 0, options: StoreOptions<{ value: number }> = {}) => {
    const handle = store<string, { value: number }>(name);
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStore(handle, (draft: { value: number }) => { draft.value += n; }),
        dec: (n = 1) => setStore(handle, (draft: { value: number }) => { draft.value -= n; }),
        set: (v: number) => setStore(handle, "value", v),
        reset: () => resetStore(handle),
        get: (): number | null => getStore(handle, "value"),
    };
};

export const createListStore = <T>(name: string, initial: T[] = [], options: StoreOptions<{ items: T[] }> = {}) => {
    const handle = store<string, { items: T[] }>(name);
    createStore(name, { items: initial }, options);
    return {
        push: (item: T) => setStore(handle, (draft: { items: T[] }) => { draft.items.push(item); }),
        removeAt: (index: number) => setStore(handle, (draft: { items: T[] }) => { draft.items.splice(index, 1); }),
        clear: () => setStore(handle, (draft: { items: T[] }) => { draft.items = []; }),
        replace: (items: T[]) => setStore(handle, (draft: { items: T[] }) => { draft.items = items; }),
        all: () => {
            const items = getStore(handle, "items");
            return items ? [...items] : [];
        },
    };
};

export const createEntityStore = <T extends { id?: string; _id?: string }>(name: string, options: StoreOptions<{ entities: Record<string, T>; ids: string[] }> = {}) => {
    const handle = store<string, { entities: Record<string, T>; ids: string[] }>(name);
    createStore(name, { entities: {}, ids: [] as string[] }, options);
    return {
        upsert: (entity: T) => setStore(handle, (draft: { entities: Record<string, T>; ids: string[] }) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && (crypto as any).randomUUID)
                    ? (crypto as any).randomUUID()
                    : `e_${++entityIdCounter}_${Date.now()}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id: string) => setStore(handle, (draft: { entities: Record<string, T>; ids: string[] }) => {
            draft.ids = draft.ids.filter((i: string) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const storeSnapshot = getStore(handle);
            const store = storeSnapshot as { ids: string[]; entities: Record<string, T> } | null;
            if (!store) return [];
            return store.ids.map((id) => store.entities[id]) as T[];
        },
        get: (id: string) => {
            const entities = getStore(handle, "entities") as Record<string, T> | null;
            return entities ? (entities[id] ?? null) : null;
        },
        clear: () => resetStore(handle),
    };
};


