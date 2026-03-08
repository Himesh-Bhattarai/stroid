import type { Expect, Equal } from "./assert.js";
import type { PersistOptions, StoreOptions, SyncOptions } from "../../index.d.ts";

type PackageApi = typeof import("../../index.d.ts");

declare const createStore: PackageApi["createStore"];
declare const createListStore: PackageApi["createListStore"];
declare const useAsyncStore: PackageApi["useAsyncStore"];

const declaredStore = createStore("declaredUser", { value: 1 }, {
  persist: {
    onMigrationFail: "keep",
    onStorageCleared: ({ name, key, reason }: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => {
      void name;
      void key;
      void reason;
    },
  },
  sync: {
    maxPayloadBytes: 1024,
    conflictResolver: ({ incoming }: { incoming: unknown }) => incoming,
  },
});

type DeclaredCreateStoreReturn = Expect<Equal<typeof declaredStore, { name: "declaredUser"; state?: { value: number } } | undefined>>;

const declaredList = createListStore<string>("declaredList", ["a"]);
const declaredListValues = declaredList.all();
type DeclaredListAllReturn = Expect<Equal<typeof declaredListValues, string[]>>;

const declaredAsync = useAsyncStore("declaredAsync");
type DeclaredAsyncStatus = Expect<Equal<typeof declaredAsync.status, "idle" | "loading" | "success" | "error" | "aborted">>;
type DeclaredAsyncRevalidating = Expect<Equal<typeof declaredAsync.revalidating, boolean>>;

const persistOptions: PersistOptions = {
  onMigrationFail: (state: unknown) => state,
  onStorageCleared: ({ name, key, reason }: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => {
    void name;
    void key;
    void reason;
  },
};
void persistOptions;

const syncOptions: SyncOptions = {
  maxPayloadBytes: 512,
  conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }: {
    local: unknown;
    incoming: unknown;
    localUpdated: number;
    incomingUpdated: number;
  }) => {
    void local;
    void incoming;
    void localUpdated;
    void incomingUpdated;
    return incoming;
  },
};
void syncOptions;

const storeOptions: StoreOptions = {
  persist: persistOptions,
  sync: syncOptions,
};
void storeOptions;

// @ts-expect-error package declarations should reject unsupported onMigrationFail literals
const badPersist: PersistOptions = { onMigrationFail: "ignore" };
void badPersist;
