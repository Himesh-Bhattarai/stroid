/**
 * @module config
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for config.
 *
 * Consumers: Internal imports and public API.
 */
export { configureStroid, resetConfig, registerMutatorProduce } from "./internals/config.js";
export type {
    LogSink,
    StroidConfig,
    FlushConfig,
    RevalidateOnFocusConfig,
} from "./internals/config.js";


