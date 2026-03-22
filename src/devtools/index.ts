/**
 * @module devtools
 *
 * LAYER: Devtools
 * OWNS:  Module-level behavior and exports for devtools.
 *
 * Consumers: Internal imports and public API.
 */
export { getHistory, clearHistory } from "./api.js";
export type { HistoryEntry, HistoryDiff } from "../features/devtools.js";
export { installDevtools } from "../install.js";


