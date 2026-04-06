/**
 * @packageDocumentation
 * Public API entrypoint for `stroid`.
 */
/**
 * @module index
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for index.
 *
 * Consumers: Internal imports and public API.
 */
// Root public API barrel. Core store API is defined in store.ts and re-exported here.
export {
    createStore,
    createStoreStrict,
    setStore,
    setStoreBatch,
    getStore,
    deleteStore,
    resetStore,
    hasStore,
    hydrateStores,
} from "./store.js";
export { getMetrics } from "./core/store-read.js";
export { getAsyncMetrics } from "./async/fetch.js";
export { getStoreHealth, findColdStores } from "./runtime-tools/index.js";
export {
    createComputed,
    invalidateComputed,
    deleteComputed,
    isComputedStore,
} from "./computed/index.js";
export { namespace, store } from "./store.js";
export type {
    Primitive,
    PrevDepth,
    PathInternal,
    Path,
    PathDepth,
    PathValue,
    PartialDeep,
    HydrateSnapshot,
    HydrateOptions,
    HydrationTrust,
    HydrationTrustBase,
    HydrateSnapshotFor,
    HydrationFailureReason,
    HydrationBlockReason,
    HydrationBootWindowControl,
    HydrationConsistencyAuthority,
    HydrationBootWindowMode,
    HydrationBootWindowOptions,
    HydrationConsistencyContract,
    HydrationConsistencyOptions,
    HydrationConsistencyPolicy,
    HydrationConsistencyStoreContract,
    HydrationConsistencyResolution,
    HydrationConsistencySource,
    HydrationMergeArgs,
    HydrationInvalidateArgs,
    HydrationConsistencyStorePolicy,
    HydrationDriftEvent,
    HydrationFailure,
    HydrationResult,
    HydrationSnapshotMetadata,
    NonFunction,
    TraceContext,
    LazyDisallow,
    StoreSnapshot,
    IsStoreNameLoose,
    StoreUpdate,
    StoreTarget,
    StorePathForTarget,
    StorePathValueForTarget,
    StoreUpdateForTarget,
    StoreDefinition,
    StoreValue,
    StoreKey,
    BrandedStoreName,
    StoreName,
    RegisteredStoreMap,
    StateFor,
    StoreStateMap,
    StrictStoreMap,
    WriteResult,
    OptionStoreValue,
    DevtoolsOptions,
    FeatureOptions,
    FeatureOptionsMap,
    LifecycleOptions,
    NormalizedOptions,
    PersistDriver,
    PersistConfig,
    PersistOptions,
    MiddlewareCtx,
    ResetCloneMode,
    StoreScope,
    StoreOptions,
    SnapshotMode,
    SyncMessage,
    SyncOptions,
    ValidateFn,
    SchemaValidateOption,
    ValidateOption,
} from "./store.js";
export { configureStroid } from "./config.js";
export type {
    StroidConfig,
    LogSink,
    AsyncCloneMode,
    FlushConfig,
    RevalidateOnFocusConfig,
} from "./config.js";
export type { ComputedOptions, DepHandle, DepValue, ComputedClassification } from "./computed/index.js";
export type { AsyncMetricsSnapshot } from "./async/cache.js";
export type { ColdStoreReport, StoreHealthEntry, StoreHealthReport } from "./runtime-tools/index.js";
export type { FeatureMetrics, StoreFeatureMeta } from "./features/feature-registry.js";
export * as queryIntegrations from "./integrations/query.js";
