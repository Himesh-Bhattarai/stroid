/**
 * @module tests/types/package-declarations.types
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/types/package-declarations.types.
 *
 * Consumers: Test runner.
 */
import type { Expect, Equal } from "./assert.js";
import type { PersistOptions, StoreOptions, SyncOptions } from "../../dist/index.d.ts";
import type {
  CausalityBoundary,
  ComputedClassification,
  ComputedDescriptor,
  GovernanceMode,
  MutationAuthority,
  RuntimeGraph,
  RuntimeGraphEdge,
  RuntimeGraphNode,
  RuntimePatch,
  RuntimePatchOp,
} from "../../dist/psr.d.ts";

type PackageApi = typeof import("../../dist/index.d.ts");
type PsrApi = typeof import("../../dist/psr.d.ts");
type DevtoolsApi = typeof import("../../src/devtools/index.js");
type RuntimeToolsApi = typeof import("../../src/runtime-tools/index.js");
type RuntimeAdminApi = typeof import("../../src/runtime-admin/index.js");
type ReactApi = typeof import("../../dist/react/index.d.ts");

declare const createStore: PackageApi["createStore"];
declare const createStoreStrict: PackageApi["createStoreStrict"];

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

const declaredStrictStore = createStoreStrict("declaredStrict", { value: 1 });
type DeclaredStrictCreateStoreReturn = Expect<Equal<typeof declaredStrictStore, { name: "declaredStrict"; state?: { value: number } }>>;

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
// @ts-expect-error lean root package no longer exports React hooks
type MissingUseStore = PackageApi["useStore"];
// @ts-expect-error lean root package no longer exports React hooks
type MissingUseSelector = PackageApi["useSelector"];
// @ts-expect-error lean root package no longer exports React hooks
type MissingUseStoreField = PackageApi["useStoreField"];
// @ts-expect-error lean root package no longer exports React hooks
type MissingUseStoreStatic = PackageApi["useStoreStatic"];
// @ts-expect-error lean root package no longer exports form hooks
type MissingUseFormStore = PackageApi["useFormStore"];
// @ts-expect-error lean root package no longer exports async hooks
type MissingUseAsyncStore = PackageApi["useAsyncStore"];
// @ts-expect-error lean root package no longer exports async suspense hooks
type MissingUseAsyncStoreSuspense = PackageApi["useAsyncStoreSuspense"];
// @ts-expect-error lean root package no longer exports async helpers
type MissingFetchStore = PackageApi["fetchStore"];
// @ts-expect-error lean root package no longer exports mergeStore
type MissingMergeStore = PackageApi["mergeStore"];
// @ts-expect-error lean root package no longer exports server helpers
type MissingCreateStoreForRequest = PackageApi["createStoreForRequest"];
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
type RootGetMetrics = PackageApi["getMetrics"];
type RootGetAsyncMetrics = PackageApi["getAsyncMetrics"];
type RootGetStoreHealth = PackageApi["getStoreHealth"];
type RootFindColdStores = PackageApi["findColdStores"];
type PsrApplyStorePatch = PsrApi["applyStorePatch"];
type PsrApplyStorePatchesAtomic = PsrApi["applyStorePatchesAtomic"];
type PsrGetComputedGraph = ReturnType<PsrApi["getComputedGraph"]>;
type PsrGetComputedDescriptor = PsrApi["getComputedDescriptor"];
type PsrEvaluateComputed = PsrApi["evaluateComputed"];
type PsrGetStoreSnapshot = PsrApi["getStoreSnapshot"];
type PsrGetTimingContract = ReturnType<PsrApi["getTimingContract"]>;
type PsrSubscribeStore = PsrApi["subscribeStore"];

type DevtoolsGetHistory = DevtoolsApi["getHistory"];
type DevtoolsClearHistory = DevtoolsApi["clearHistory"];
type RuntimeToolsListStores = RuntimeToolsApi["listStores"];
type RuntimeToolsGetStoreMeta = RuntimeToolsApi["getStoreMeta"];
type RuntimeToolsGetInitialState = RuntimeToolsApi["getInitialState"];
type RuntimeToolsGetMetrics = RuntimeToolsApi["getMetrics"];
type RuntimeToolsGetRuntimeGraph = RuntimeToolsApi["getRuntimeGraph"];
type RuntimeAdminClearAllStores = RuntimeAdminApi["clearAllStores"];
void (0 as unknown as DevtoolsGetHistory);
void (0 as unknown as DevtoolsClearHistory);
void (0 as unknown as RuntimeToolsListStores);
void (0 as unknown as RuntimeToolsGetStoreMeta);
void (0 as unknown as RuntimeToolsGetInitialState);
void (0 as unknown as RuntimeToolsGetMetrics);
void (0 as unknown as RuntimeToolsGetRuntimeGraph);
void (0 as unknown as RuntimeAdminClearAllStores);
void (0 as unknown as RootGetMetrics);
void (0 as unknown as RootGetAsyncMetrics);
void (0 as unknown as RootGetStoreHealth);
void (0 as unknown as RootFindColdStores);
void (0 as unknown as PsrApplyStorePatch);
void (0 as unknown as PsrApplyStorePatchesAtomic);
void (0 as unknown as PsrGetComputedGraph);
void (0 as unknown as PsrGetComputedDescriptor);
void (0 as unknown as PsrEvaluateComputed);
void (0 as unknown as PsrGetStoreSnapshot);
void (0 as unknown as PsrSubscribeStore);
const runtimePatchOp: RuntimePatchOp = "set";
const computedClassification: ComputedClassification = "deterministic";
const runtimePatch: RuntimePatch = {
  id: "patch-1",
  store: "user",
  path: [],
  op: runtimePatchOp,
  meta: {
    timestamp: 1,
    source: "setStore",
  },
};
void runtimePatch;
const computedDescriptor: ComputedDescriptor = {
  id: "computed-node",
  storeId: "computed-node",
  path: [],
  dependencies: [],
  nodeType: "computed",
  classification: computedClassification,
};
void computedDescriptor;
const runtimeGraphNode: RuntimeGraphNode = {
  id: "[\"leaf\",\"user\",[]]",
  storeId: "user",
  path: [],
  type: "leaf",
};
const runtimeGraphEdge: RuntimeGraphEdge = {
  from: runtimeGraphNode.id,
  to: "[\"computed\",\"computed-node\",[]]",
  type: "leaf-input",
};
const runtimeGraph: RuntimeGraph = {
  granularity: "store",
  nodes: [runtimeGraphNode],
  edges: [runtimeGraphEdge],
};
void runtimeGraph;

type PsrTimingContract = Expect<Equal<PsrGetTimingContract, {
  simulationWindow: "pre-commit" | "pre-render" | "post-render";
  executionModel: "sync" | "async-boundary";
  effectScope: "in-pipeline" | "out-of-pipeline";
  governanceMode: GovernanceMode;
  mutationAuthority: MutationAuthority;
  causalityBoundary: CausalityBoundary;
  reasons: readonly string[];
}>>;
void (0 as unknown as PsrTimingContract);

type PsrComputedClassification = Expect<Equal<ComputedClassification, "deterministic" | "opaque" | "asyncBoundary">>;
void (0 as unknown as PsrComputedClassification);
type PsrComputedGraph = Expect<Equal<PsrGetComputedGraph, RuntimeGraph>>;
void (0 as unknown as PsrComputedGraph);
const governanceMode: GovernanceMode = "bounded-governor";
const mutationAuthority: MutationAuthority = "shared";
const causalityBoundary: CausalityBoundary = "async-boundary";
void governanceMode;
void mutationAuthority;
void causalityBoundary;

type ReactUseStore = ReactApi["useStore"];
type ReactUseSelector = ReactApi["useSelector"];
type ReactUseAsyncStore = ReactApi["useAsyncStore"];
void (0 as unknown as ReactUseStore);
void (0 as unknown as ReactUseSelector);
void (0 as unknown as ReactUseAsyncStore);

// @ts-expect-error package declarations should reject unsupported onMigrationFail literals
const badPersist: PersistOptions = { onMigrationFail: "ignore" };
void badPersist;


