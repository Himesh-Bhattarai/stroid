/**
 * @module sync
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for sync.
 *
 * Consumers: Internal imports and public API.
 */
import { installSync } from "./install.js";

installSync();

export { installSync };


