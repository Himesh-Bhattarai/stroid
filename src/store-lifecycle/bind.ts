/**
 * @fileoverview src\store-lifecycle\bind.ts
 */
import type { StoreRegistry } from "../store-registry.js";
import { resolveScope, setRegistryContext, initializeRegisteredFeatureRuntimes, defaultRegistryScope } from "./registry.js";
import { resetPathValidationCache } from "./validation.js";
import { clearFeatureContexts } from "./hooks.js";
import { resetSsrWarningFlag } from "./identity.js";
import { registerTestResetHook } from "../internals/test-reset.js";

export const bindRegistry = (scopeOrRegistry?: string | StoreRegistry): void => {
    const { scope, registry } = resolveScope(scopeOrRegistry);
    setRegistryContext(scope, registry);
    resetPathValidationCache(registry);
    clearFeatureContexts();
    resetSsrWarningFlag();
    initializeRegisteredFeatureRuntimes();
};

export const useRegistry = (scopeId: string): void => bindRegistry(scopeId);

registerTestResetHook("registry.bind-default", () => bindRegistry(defaultRegistryScope), 120);

