/**
 * @module features/sync/resources
 *
 * LAYER: Feature runtime
 * OWNS:  Sync resource lifecycle helpers.
 */
import type { SyncChannels, SyncClocks, SyncVersions, SyncWindowCleanup } from "./types.js";

export const bumpSyncClock = (name: string, syncClocks: SyncClocks): number => {
    syncClocks[name] = (syncClocks[name] ?? 0) + 1;
    return syncClocks[name];
};

export const absorbSyncClock = (
    name: string,
    incomingClock: number,
    syncClocks: SyncClocks
): number => {
    syncClocks[name] = Math.max(syncClocks[name] ?? 0, incomingClock) + 1;
    return syncClocks[name];
};

export const closeSyncResources = ({
    name,
    syncChannels,
    syncWindowCleanup,
    syncClocks,
    syncVersions,
}: {
    name: string;
    syncChannels: SyncChannels;
    syncWindowCleanup: SyncWindowCleanup;
    syncClocks: SyncClocks;
    syncVersions: SyncVersions;
}): void => {
    syncChannels[name]?.close();
    delete syncChannels[name];
    syncWindowCleanup[name]?.();
    delete syncWindowCleanup[name];
    delete syncClocks[name];
    delete syncVersions[name];
};

export const cleanupAllSyncResources = ({
    syncChannels,
    syncWindowCleanup,
}: {
    syncChannels: SyncChannels;
    syncWindowCleanup: SyncWindowCleanup;
}): void => {
    Object.values(syncWindowCleanup).forEach((dispose) => {
        try { dispose(); } catch (_) { /* ignore cleanup errors */ }
    });
    Object.values(syncChannels).forEach((channel) => {
        try { channel.close(); } catch (_) { /* ignore cleanup errors */ }
    });
};
