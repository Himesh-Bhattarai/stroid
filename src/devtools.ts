import { registerDevtoolsFeature } from "./features/devtools.js";
export { getHistory, clearHistory } from "./devtools-api.js";
export type { HistoryEntry, HistoryDiff } from "./features/devtools.js";

registerDevtoolsFeature();
