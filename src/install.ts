/**
 * @fileoverview src\install.ts
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

