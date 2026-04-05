/**
 * @module features/sync/types
 *
 * LAYER: Feature runtime
 * OWNS:  Shared sync runtime types.
 */
import type { SyncOptions } from "../../adapters/options.js";

export type SyncChannels = Record<string, BroadcastChannel>;
export type SyncClocks = Record<string, number>;
export type SyncVersion = { clock: number; updatedAt: number; source: string };
export type SyncVersions = Record<string, SyncVersion>;
export type SyncWindowCleanup = Record<string, () => void>;

export type SyncMeta = {
    updatedAt: string;
    updatedAtMs?: number;
    updateCount: number;
    options: {
        sync?: boolean | SyncOptions;
    };
};
