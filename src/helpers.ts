import { createStore, setStore, resetStore, getStore } from "./store.js";
import type { StoreOptions } from "./store.js";

let entityIdCounter = 0;
const setStoreAny = setStore as (name: string, ...rest: any[]) => any;
const getStoreAny = getStore as (name: string, path?: any) => any;

export const createCounterStore = (name: string, initial = 0, options: StoreOptions = {}) => {
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStoreAny(name, (draft: any) => { draft.value += n; }),
        dec: (n = 1) => setStoreAny(name, (draft: any) => { draft.value -= n; }),
        set: (v: number) => setStoreAny(name, "value", v),
        reset: () => resetStore(name),
        get: (): number | null => getStoreAny(name, "value") as number | null,
    };
};

export const createListStore = <T>(name: string, initial: T[] = [], options: StoreOptions = {}) => {
    createStore(name, { items: initial }, options);
    return {
        push: (item: T) => setStoreAny(name, (draft: any) => { draft.items.push(item); }),
        removeAt: (index: number) => setStoreAny(name, (draft: any) => { draft.items.splice(index, 1); }),
        clear: () => setStoreAny(name, { items: [] }),
        replace: (items: T[]) => setStoreAny(name, { items }),
        all: () => (getStoreAny(name, "items") as T[] | null) ?? [],
    };
};

export const createEntityStore = <T extends { id?: string; _id?: string }>(name: string, options: StoreOptions = {}) => {
    createStore(name, { entities: {}, ids: [] as string[] }, options);
    return {
        upsert: (entity: T) => setStoreAny(name, (draft: any) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && (crypto as any).randomUUID)
                    ? (crypto as any).randomUUID()
                    : `e_${++entityIdCounter}_${Date.now()}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id: string) => setStoreAny(name, (draft: any) => {
            draft.ids = draft.ids.filter((i: string) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const store = getStoreAny(name) as { ids: string[]; entities: Record<string, T> } | null;
            if (!store) return [];
            return store.ids.map((id) => store.entities[id]) as T[];
        },
        get: (id: string) => getStoreAny(name, ["entities", id]) as T | null,
        clear: () => resetStore(name),
    };
};
