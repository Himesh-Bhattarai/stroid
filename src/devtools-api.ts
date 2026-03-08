import { _getFeatureApi } from "./store.js";
import type { HistoryEntry } from "./features/devtools.js";

export const getHistory = (name: string, limit?: number): HistoryEntry[] =>
    (_getFeatureApi("devtools")?.getHistory?.(name, limit) ?? []) as HistoryEntry[];

export const clearHistory = (name?: string): void => {
    _getFeatureApi("devtools")?.clearHistory?.(name);
};
