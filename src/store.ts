/**
 * @module store
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store.
 *
 * Consumers: Internal imports and public API.
 */
// Public store API barrel. Internal modules should import from leaf modules directly.
export type {
    Primitive,
    PrevDepth,
    PathInternal,
    Path,
    PathDepth,
    PathValue,
    PartialDeep,
    HydrateSnapshotFor,
    HydrationFailureReason,
    HydrationFailure,
    HydrationBlockReason,
    HydrationBootWindowControl,
    HydrationResult,
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
} from "./core/store-lifecycle/types.js";
export type {
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
    HydrationSnapshotMetadata,
} from "./core/hydration-consistency.js";
export type {
    DevtoolsOptions,
    FeatureOptions,
    FeatureOptionsMap,
    LifecycleOptions,
    NormalizedOptions,
    StoreValue as OptionStoreValue,
    PersistConfig,
    PersistDriver,
    PersistOptions,
    MiddlewareCtx,
    ResetCloneMode,
    StoreScope,
    StoreOptions,
    SnapshotMode,
    SchemaValidateOption,
    SyncMessage,
    SyncOptions,
    ValidateFn,
    ValidateOption,
} from "./adapters/options.js";
export type { NonFunction, TraceContext } from "./types/utility.js";
export type { LazyDisallow } from "./core/store-create.js";
export type { StoreSnapshot } from "./core/store-read.js";
export type {
    IsStoreNameLoose,
    StoreUpdate,
    StoreTarget,
    StorePathForTarget,
    StorePathValueForTarget,
    StoreUpdateForTarget,
} from "./core/store-set-impl.js";
export type {
    HydrateSnapshot,
    HydrateOptions,
    HydrationTrust,
    HydrationTrustBase,
} from "./core/store-hydrate-impl.js";

export {
    setStore,
    replaceStore,
    deleteStore,
    resetStore,
    hydrateStores,
} from "./core/store-write.js";
export { createStore, createStoreStrict } from "./core/store-create.js";

export {
    setStoreBatch,
    subscribeStore,
    subscribeInternal as _subscribe,
    subscribe,
    getStoreSnapshot,
    getSnapshot as _getSnapshot,
} from "./core/store-notify.js";

export {
    getStore,
    hasStore,
    isLazyStore,
    isStoreMaterialized,
    isLazyPending,
    _hasStoreEntryInternal,
    _getStoreValueRef,
    _getFeatureApi,
    getInitialState,
    getMetrics,
} from "./core/store-read.js";

export { clearAllStores, clearStores } from "./runtime-admin/index.js";

export { store, namespace } from "./core/store-name.js";
