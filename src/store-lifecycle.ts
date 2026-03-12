/**
 * @module store-lifecycle
 *
 * LAYER: Core Engine
 * OWNS:  Registry state variables (stores, meta, subscribers, ...) and all
 *        pure primitives that operate on them (sanitize, validate, path-safety,
 *        feature hook dispatch).
 *
 * DOES NOT KNOW about: createStore(), setStore(), React hooks,
 *        or any specific feature plugin by name.
 *
 * Consumers: store-write (write API), store-read, store-notify,
 *            hooks-core, store-engine (re-export barrel).
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
    getSsrWarningIssued,
    markSsrWarningIssued,
    resetSsrWarningFlag,
    warnMissingFeature,
} from "./store-lifecycle/identity.js";

export { bindRegistry, useRegistry } from "./store-lifecycle/bind.js";
