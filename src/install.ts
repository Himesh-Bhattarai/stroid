/**
 * @module install
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for install.
 *
 * Consumers: Internal imports and public API.
 */
import { installPersist } from "./features/persist.js";
import { installSync } from "./features/sync.js";
import { installDevtools } from "./features/devtools.js";

export { installPersist, installSync, installDevtools };

export const installAllFeatures = (): void => {
    installPersist();
    installSync();
    installDevtools();
};

