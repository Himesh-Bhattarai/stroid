/**
 * @module features/sync/helpers
 *
 * LAYER: Feature runtime
 * OWNS:  Sync protocol and ordering helpers.
 */
import type { SyncOptions } from "../../adapters/options.js";
import { resolveUpdatedAtMs } from "../state-helpers.js";
import type { SyncMeta, SyncVersion } from "./types.js";

export const SYNC_PROTOCOL_VERSION = 1;
const DEFAULT_LOOP_GUARD_MS = 100;

export const resolveProtocolVersion = (msg: { v?: unknown; protocol?: unknown }): number | undefined =>
    typeof msg?.v === "number"
        ? msg.v as number
        : (typeof msg?.protocol === "number" ? msg.protocol as number : undefined);

export const resolveLoopGuardMs = (syncOption?: boolean | SyncOptions): number | null => {
    if (!syncOption) return null;
    if (syncOption === true) return DEFAULT_LOOP_GUARD_MS;
    if (typeof syncOption !== "object") return null;
    const guard = syncOption.loopGuard;
    if (guard === false) return null;
    if (guard === true || guard === undefined) return DEFAULT_LOOP_GUARD_MS;
    if (typeof guard === "object") {
        const ms = guard.windowMs;
        if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) return ms;
        return DEFAULT_LOOP_GUARD_MS;
    }
    return DEFAULT_LOOP_GUARD_MS;
};

export const byteLength = (value: string): number => {
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(value).length;
    }
    if (typeof Buffer !== "undefined") {
        return Buffer.byteLength(value);
    }
    return value.length;
};

export const compareSyncOrder = ({
    incoming,
    accepted,
}: {
    incoming: { clock?: number; source?: string };
    accepted?: SyncVersion;
}): number => {
    const localClock = accepted?.clock ?? 0;
    const incomingClock = typeof incoming.clock === "number" ? incoming.clock : 0;
    if (incomingClock !== localClock) return incomingClock - localClock;

    const incomingSource = incoming.source ?? "";
    const localSource = accepted?.source ?? "";
    if (incomingSource === localSource) return 0;
    return incomingSource.localeCompare(localSource, "en", { sensitivity: "variant" });
};

export const resolveMetaUpdatedAtMs = (meta?: SyncMeta): number =>
    meta?.updatedAtMs ?? resolveUpdatedAtMs({ value: meta?.updatedAt, fallbackMs: 0 });

export const isValidSyncMessage = (msg: unknown): msg is {
    v?: number;
    protocol?: number;
    type: string;
    name: string;
    clock: number;
    source: string;
    data?: unknown;
    checksum?: unknown;
    updatedAt?: number;
    auth?: unknown;
    token?: unknown;
    requestedAt?: number;
} => {
    if (typeof msg !== "object" || msg === null) return false;
    const m = msg as Record<string, unknown>;
    const hasVersion = typeof m.v === "number" || typeof m.protocol === "number";
    return (
        hasVersion &&
        typeof m.type === "string" &&
        typeof m.name === "string" &&
        typeof m.clock === "number" &&
        typeof m.source === "string"
    );
};
