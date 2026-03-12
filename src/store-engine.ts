/**
 * @module store-engine
 *
 * LAYER: Internal re-export barrel (zero runtime bytes after bundling).
 *
 * Groups all exports from `store-lifecycle` into four logical slices so
 * that consumers can see *why* they are importing something, not just *what*.
 *
 * Consumers: store-write (the only external consumer of lifecycle internals).
 * Public API files (index.ts, core.ts, etc.) should NOT import from here.
 */

// ─── Registry state ────────────────────────────────────────────────────────
// Raw data containers bound to the active registry scope.
export {
    stores,
    meta,
    subscribers,
    initialStates,
    initialFactories,
    snapshotCache,
    featureRuntimes,
    pathValidationCache,
    storeAdmin,
    bindRegistry,
    defaultRegistryScope,
} from "./store-lifecycle.js";

// ─── Validation & sanitization ─────────────────────────────────────────────
// Pure functions that check and clean state values.
export {
    sanitizeValue,
    normalizeCommittedState,
    runValidation,
    validatePathSafety,
    invalidatePathCache,
    clearPathValidationCache,
    materializeInitial,
} from "./store-lifecycle.js";

// ─── Lifecycle hook dispatch ────────────────────────────────────────────────
// Functions that run feature hooks and middleware at the right moments.
export {
    runFeatureCreateHooks,
    runFeatureWriteHooks,
    runFeatureDeleteHooks,
    runMiddlewareForStore,
    runStoreHookSafe,
    applyFeatureState,
    setStoreValueInternal,
    getStoreValueRef,
    resolveFeatureAvailability,
} from "./store-lifecycle.js";

// ─── Identity & existence ───────────────────────────────────────────────────
// Name resolution, store presence checks, and error reporting.
export {
    nameOf,
    qualifyName,
    exists,
    hasStoreEntryInternal,
    getFeatureApi,
    reportStoreCreationError,
    reportStoreError,
    getSsrWarningIssued,
    markSsrWarningIssued,
    resetSsrWarningFlag,
    clearFeatureContexts,
    clearAllRegistries,
    resetFeaturesForTests,
} from "./store-lifecycle.js";

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
    Path,
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
} from "./store-lifecycle.js";
