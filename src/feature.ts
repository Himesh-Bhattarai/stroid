/**
 * @module feature
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for feature.
 *
 * Consumers: Internal imports and public API.
 */
export type {
    BuiltInFeatureName,
    FeatureName,
    StoreFeatureMeta,
    FeatureMetrics,
    FeatureHookContext,
    BaseFeatureContext,
    FeatureCreateContext,
    FeatureWriteContext,
    FeatureDeleteContext,
    StoreFeatureRuntime,
    StoreFeatureFactory,
    DevtoolsFeatureApi,
} from "./features/feature-registry.js";

export {
    registerStoreFeature,
    hasRegisteredStoreFeature,
    getRegisteredFeatureNames,
} from "./features/feature-registry.js";


