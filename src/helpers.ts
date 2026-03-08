import { createStore, setStore, resetStore, getStore } from "./store.js";
import type { StoreOptions } from "./store.js";

let entityIdCounter = 0;

export const createCounterStore = (name: string, initial = 0, options: StoreOptions = {}) => {
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStore(name, (draft: any) => { draft.value += n; }),
        dec: (n = 1) => setStore(name, (draft: any) => { draft.value -= n; }),
        set: (v: number) => setStore(name, "value", v),
        reset: () => resetStore(name),
        get: (): number | null => getStore(name, "value") as number | null,
    };
};

export const createListStore = <T>(name: string, initial: T[] = [], options: StoreOptions = {}) => {
    createStore(name, { items: initial }, options);
    return {
        push: (item: T) => setStore(name, (draft: any) => { draft.items.push(item); }),
        removeAt: (index: number) => setStore(name, (draft: any) => { draft.items.splice(index, 1); }),
        clear: () => setStore(name, { items: [] }),
        replace: (items: T[]) => setStore(name, { items }),
        all: () => (getStore(name, "items") as T[] | null) ?? [],
    };
};

export const createEntityStore = <T extends { id?: string; _id?: string }>(name: string, options: StoreOptions = {}) => {
    createStore(name, { entities: {}, ids: [] as string[] }, options);
    return {
        upsert: (entity: T) => setStore(name, (draft: any) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && (crypto as any).randomUUID)
                    ? (crypto as any).randomUUID()
                    : `e_${++entityIdCounter}_${Date.now()}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id: string) => setStore(name, (draft: any) => {
            draft.ids = draft.ids.filter((i: string) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const store = getStore(name) as { ids: string[]; entities: Record<string, T> } | null;
            if (!store) return [];
            return store.ids.map((id) => store.entities[id]) as T[];
        },
        get: (id: string) => getStore(name, ["entities", id]) as T | null,
        clear: () => resetStore(name),
    };
};
