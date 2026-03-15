/**
 * @module devtools
 *
 * LAYER: Devtools
 * OWNS:  Module-level behavior and exports for devtools.
 *
 * Consumers: Internal imports and public API.
 */
import { installDevtools } from "./install.js";
export { getHistory, clearHistory } from "./devtools-api.js";
export type { HistoryEntry, HistoryDiff } from "./features/devtools.js";

installDevtools();

export { installDevtools };


