/**
 * @fileoverview src\feature.ts
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

