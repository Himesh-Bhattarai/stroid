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
    BaseFeatureContext,
    FeatureCreateContext,
    FeatureWriteContext,
    FeatureDeleteContext,
    StoreFeatureRuntime,
    StoreFeatureFactory,
    DevtoolsFeatureApi,
} from "./feature-registry.js";

export {
    registerStoreFeature,
    hasRegisteredStoreFeature,
    getRegisteredFeatureNames,
} from "./feature-registry.js";


