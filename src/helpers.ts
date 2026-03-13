import { createStore, setStore, resetStore, getStore, store } from "./store.js";
import type { StoreOptions } from "./store.js";

let entityIdCounter = 0;

export const createCounterStore = (name: string, initial = 0, options: StoreOptions = {}) => {
    const handle = store<string, { value: number }>(name);
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStore(handle, (draft) => { draft.value += n; }),
        dec: (n = 1) => setStore(handle, (draft) => { draft.value -= n; }),
        set: (v: number) => setStore(handle, "value", v),
        reset: () => resetStore(handle),
        get: (): number | null => getStore(handle, "value"),
    };
};

export const createListStore = <T>(name: string, initial: T[] = [], options: StoreOptions = {}) => {
    const handle = store<string, { items: T[] }>(name);
    createStore(name, { items: initial }, options);
    return {
        push: (item: T) => setStore(handle, (draft) => { draft.items.push(item); }),
        removeAt: (index: number) => setStore(handle, (draft) => { draft.items.splice(index, 1); }),
        clear: () => setStore(handle, { items: [] }),
        replace: (items: T[]) => setStore(handle, { items }),
        all: () => {
            const items = getStore(handle, "items");
            return items ? [...items] : [];
        },
    };
};

export const createEntityStore = <T extends { id?: string; _id?: string }>(name: string, options: StoreOptions = {}) => {
    const handle = store<string, { entities: Record<string, T>; ids: string[] }>(name);
    createStore(name, { entities: {}, ids: [] as string[] }, options);
    return {
        upsert: (entity: T) => setStore(handle, (draft) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && (crypto as any).randomUUID)
                    ? (crypto as any).randomUUID()
                    : `e_${++entityIdCounter}_${Date.now()}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id: string) => setStore(handle, (draft) => {
            draft.ids = draft.ids.filter((i: string) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const storeSnapshot = getStore(handle);
            const store = storeSnapshot as { ids: string[]; entities: Record<string, T> } | null;
            if (!store) return [];
            return store.ids.map((id) => store.entities[id]) as T[];
        },
        get: (id: string) => getStore(handle, ["entities", id]) as T | null,
        clear: () => resetStore(handle),
    };
};
