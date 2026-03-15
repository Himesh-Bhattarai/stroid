/**
 * @module persist
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for persist.
 *
 * Consumers: Internal imports and public API.
 */
import { installPersist } from "./install.js";

installPersist();

export { installPersist };


