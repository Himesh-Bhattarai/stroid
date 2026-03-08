import type { Expect, Equal } from "./assert.js";
import type { PersistOptions, StoreOptions, SyncOptions } from "../../index.d.ts";

type PackageApi = typeof import("../../index.d.ts");
type DevtoolsApi = typeof import("../../src/devtools.js");
type RuntimeToolsApi = typeof import("../../src/runtime-tools.js");
type RuntimeAdminApi = typeof import("../../src/runtime-admin.js");

declare const createStore: PackageApi["createStore"];

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

// @ts-expect-error lean root package no longer exports helper factories
type MissingCreateListStore = PackageApi["createListStore"];
// @ts-expect-error lean root package no longer exports selector helpers
type MissingCreateSelector = PackageApi["createSelector"];
// @ts-expect-error lean root package no longer exports selector subscriptions
type MissingSubscribeWithSelector = PackageApi["subscribeWithSelector"];
// @ts-expect-error lean root package no longer exports async hooks
type MissingUseAsyncStore = PackageApi["useAsyncStore"];
// @ts-expect-error lean root package no longer exports async helpers
type MissingFetchStore = PackageApi["fetchStore"];
// @ts-expect-error lean root package no longer exports server helpers
type MissingCreateStoreForRequest = PackageApi["createStoreForRequest"];
// @ts-expect-error lean root package no longer exports chain
type MissingChain = PackageApi["chain"];
// @ts-expect-error lean root package no longer exports devtools history APIs
type MissingGetHistory = PackageApi["getHistory"];
// @ts-expect-error lean root package no longer exports devtools history cleanup
type MissingClearHistory = PackageApi["clearHistory"];
// @ts-expect-error lean root package no longer exports runtime-tools cleanup
type MissingClearAllStores = PackageApi["clearAllStores"];
// @ts-expect-error lean root package no longer exports runtime-tools store listing
type MissingListStores = PackageApi["listStores"];
// @ts-expect-error lean root package no longer exports runtime-tools store metadata
type MissingGetStoreMeta = PackageApi["getStoreMeta"];
// @ts-expect-error lean root package no longer exports runtime-tools initial snapshot API
type MissingGetInitialState = PackageApi["getInitialState"];
// @ts-expect-error lean root package no longer exports runtime-tools metrics API
type MissingGetMetrics = PackageApi["getMetrics"];

type DevtoolsGetHistory = DevtoolsApi["getHistory"];
type DevtoolsClearHistory = DevtoolsApi["clearHistory"];
type RuntimeToolsListStores = RuntimeToolsApi["listStores"];
type RuntimeToolsGetStoreMeta = RuntimeToolsApi["getStoreMeta"];
type RuntimeToolsGetInitialState = RuntimeToolsApi["getInitialState"];
type RuntimeToolsGetMetrics = RuntimeToolsApi["getMetrics"];
type RuntimeAdminClearAllStores = RuntimeAdminApi["clearAllStores"];
void (0 as unknown as DevtoolsGetHistory);
void (0 as unknown as DevtoolsClearHistory);
void (0 as unknown as RuntimeToolsListStores);
void (0 as unknown as RuntimeToolsGetStoreMeta);
void (0 as unknown as RuntimeToolsGetInitialState);
void (0 as unknown as RuntimeToolsGetMetrics);
void (0 as unknown as RuntimeAdminClearAllStores);

// @ts-expect-error package declarations should reject unsupported onMigrationFail literals
const badPersist: PersistOptions = { onMigrationFail: "ignore" };
void badPersist;
