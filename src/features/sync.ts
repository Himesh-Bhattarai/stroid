/**
 * @module features/sync
 *
 * LAYER: Feature runtime
 * OWNS:  Stable facade exports for sync feature.
 *
 * Consumers: Internal imports and public API.
 */
export type {
    SyncChannels,
    SyncClocks,
    SyncVersion,
    SyncVersions,
    SyncWindowCleanup,
} from "./sync/types.js";

export {
    absorbSyncClock,
    bumpSyncClock,
    cleanupAllSyncResources,
    closeSyncResources,
} from "./sync/resources.js";

export { broadcastSync, setupSync } from "./sync/channel.js";
export { createSyncFeatureRuntime, installSync, registerSyncFeature } from "./sync/runtime.js";
