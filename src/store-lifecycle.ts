/**
 * @module store-lifecycle
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-lifecycle.
 *
 * Consumers: Internal imports and public API.
 */
export type {
    Path,
    PathDepth,
    PathValue,
    PartialDeep,
    StoreValue,
    StoreKey,
    StoreDefinition,
    StoreName,
    StateFor,
    WriteResult,
    Subscriber,
    StoreStateMap,
    StrictStoreMap,
    UnregisteredStoreName,
} from "./store-lifecycle/types.js";

export {
    stores,
    meta,
    subscribers,
    initialStates,
    initialFactories,
    snapshotCache,
    featureRuntimes,
    storeAdmin,
    getStoreAdmin,
    getFeatureRuntime,
    hasStoreEntryInternal,
    getStoreValueRef,
    setStoreValueInternal,
    applyFeatureState,
    clearAllRegistries,
    resetFeaturesForTests,
    getMetaEntry,
    getRegistry,
    defaultRegistryScope,
} from "./store-lifecycle/registry.js";

export {
    sanitizeValue,
    normalizeCommittedState,
    runValidation,
    validatePathSafety,
    invalidatePathCache,
    clearPathValidationCache,
    materializeInitial,
    pathValidationCache,
} from "./store-lifecycle/validation.js";

export {
    runFeatureCreateHooks,
    runFeatureWriteHooks,
    runFeatureDeleteHooks,
    runMiddlewareForStore,
    runStoreHookSafe,
    resolveFeatureAvailability,
    clearFeatureContexts,
    createBaseFeatureContext,
} from "./store-lifecycle/hooks.js";

export {
    nameOf,
    qualifyName,
    exists,
    getFeatureApi,
    reportStoreCreationError,
    reportStoreError,
    reportStoreWarning,
    reportStoreCreationWarning,
    getSsrWarningIssued,
    markSsrWarningIssued,
    resetSsrWarningFlag,
    warnMissingFeature,
} from "./store-lifecycle/identity.js";

export { bindRegistry, useRegistry } from "./store-lifecycle/bind.js";


