/**
 * @module query
 *
 * LAYER: Public API
 * OWNS:  Lightweight query-key helpers for bundle-sensitive consumers.
 *
 * Consumers: Public API.
 */
export { reactQueryKey, swrKey } from "./integrations/query-keys.js";
export type { QueryStoreTarget } from "./integrations/query-keys.js";
