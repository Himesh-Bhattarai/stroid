/**
 * @module install
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for install.
 *
 * Consumers: Internal imports and public API.
 */
import { registerPersistFeature } from "./features/persist.js";
import { registerSyncFeature } from "./features/sync.js";
import { registerDevtoolsFeature } from "./features/devtools.js";

export const installPersist = (): void => {
    registerPersistFeature();
};

export const installSync = (): void => {
    registerSyncFeature();
};

export const installDevtools = (): void => {
    registerDevtoolsFeature();
};

export const installAllFeatures = (): void => {
    installPersist();
    installSync();
    installDevtools();
};


