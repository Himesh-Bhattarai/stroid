/**
 * @module adapters/options
 *
 * LAYER: Module
 * OWNS:  Stable facade exports for adapter options.
 *
 * Consumers: Internal imports and public API.
 */
export type {
    DevtoolsOptions,
    FeatureOptions,
    FeatureOptionsMap,
    LifecycleOptions,
    MiddlewareCtx,
    NormalizedOptions,
    PersistConfig,
    PersistDriver,
    PersistOptions,
    ResetCloneMode,
    SchemaValidateOption,
    SnapshotMode,
    StoreOptions,
    StoreScope,
    StoreValue,
    SyncMessage,
    SyncOptions,
    ValidateFn,
    ValidateOption,
} from "./options/types.js";

export {
    collectLegacyOptionDeprecationWarnings,
    resetLegacyOptionDeprecationWarningsForTests,
} from "./options/legacy.js";
export { normalizePersistOptions } from "./options/persist.js";
export { normalizeStoreOptions } from "./options/normalize.js";
