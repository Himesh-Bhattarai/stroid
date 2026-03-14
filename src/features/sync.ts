import type { StoreValue, SyncMessage, SyncOptions } from "../adapters/options.js";
import { registerStoreFeature, type StoreFeatureRuntime } from "../feature-registry.js";
import { normalizeFeatureState, resolveUpdatedAtMs } from "./state-helpers.js";

export type SyncChannels = Record<string, BroadcastChannel>;
export type SyncClocks = Record<string, number>;
export type SyncVersion = { clock: number; updatedAt: number; source: string };
export type SyncVersions = Record<string, SyncVersion>;
export type SyncWindowCleanup = Record<string, () => void>;

let _registered = false;
const SYNC_PROTOCOL_VERSION = 1;
const resolveProtocolVersion = (msg: { v?: unknown; protocol?: unknown }): number | undefined =>
    typeof msg?.v === "number"
        ? msg.v as number
        : (typeof msg?.protocol === "number" ? msg.protocol as number : undefined);

type SyncMeta = {
    updatedAt: string;
    updatedAtMs?: number;
    updateCount: number;
    options: {
        sync?: boolean | SyncOptions;
    };
};

const byteLength = (value: string): number => {
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(value).length;
    }
    if (typeof Buffer !== "undefined") {
        return Buffer.byteLength(value);
    }
    return value.length;
};

const compareSyncOrder = ({
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

const resolveMetaUpdatedAtMs = (meta?: SyncMeta): number =>
    meta?.updatedAtMs ?? resolveUpdatedAtMs({ value: meta?.updatedAt, fallbackMs: 0 });

const isValidSyncMessage = (msg: unknown): msg is {
    v?: number;
    protocol?: number;
    type: string;
    name: string;
    clock: number;
    source: string;
    data?: unknown;
    updatedAt?: number;
    auth?: unknown;
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

const requestSyncSnapshot = ({
    name,
    syncChannels,
    instanceId,
    reportStoreError,
}: {
    name: string;
    syncChannels: SyncChannels;
    instanceId: string;
    reportStoreError: (name: string, message: string) => void;
}): void => {
    const channel = syncChannels[name];
    if (!channel) return;
    try {
        channel.postMessage({
            v: SYNC_PROTOCOL_VERSION,
            protocol: SYNC_PROTOCOL_VERSION,
            type: "sync-request",
            source: instanceId,
            name,
            clock: 0,
            requestedAt: Date.now(),
        });
    } catch (err) {
        reportStoreError(name, `Failed to request sync snapshot for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
};

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

export const setupSync = ({
    name,
    syncOption,
    syncChannels,
    syncClocks,
    syncVersions,
    syncWindowCleanup,
    instanceId,
    getMeta,
    getAcceptedSyncVersion,
    getStoreValue,
    hasStoreEntry,
    notify,
    validate,
    reportStoreError,
    warn,
    setStoreValue,
    normalizeIncomingState,
    acceptIncomingSyncVersion,
    resolveSyncVersion,
    broadcastSync,
}: {
    name: string;
    syncOption?: boolean | SyncOptions;
    syncChannels: SyncChannels;
    syncClocks: SyncClocks;
    syncVersions: SyncVersions;
    syncWindowCleanup: SyncWindowCleanup;
    instanceId: string;
    getMeta: (name: string) => SyncMeta | undefined;
    getAcceptedSyncVersion: (name: string) => SyncVersion | undefined;
    getStoreValue: (name: string) => StoreValue;
    hasStoreEntry: (name: string) => boolean;
    notify: (name: string) => void;
    validate: (name: string, next: StoreValue) => { ok: boolean; value?: StoreValue };
    reportStoreError: (name: string, message: string) => void;
    warn: (message: string) => void;
    setStoreValue: (name: string, value: StoreValue) => void;
    normalizeIncomingState: (name: string, value: StoreValue) => StoreValue | null;
    acceptIncomingSyncVersion: (name: string, updatedAtMs: number, incomingClock: number, source: string) => void;
    resolveSyncVersion: (name: string, updatedAtMs: number, incomingClock: number) => number;
    broadcastSync: (name: string) => void;
}): void => {
    if (!syncOption) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
        reportStoreError(name, `Sync enabled for "${name}" but BroadcastChannel not available in this environment.`);
        return;
    }
    const channelName = typeof syncOption === "object" && syncOption.channel
        ? syncOption.channel
        : `stroid_sync_${name}`;
    try {
        const channel = new BroadcastChannel(channelName);
        syncChannels[name] = channel;
        channel.onmessage = (event: MessageEvent) => {
            const msg = event.data as any;
            if (!msg || msg.source === instanceId) return;
            if (msg.name !== name) return;
            if (syncChannels[name] !== channel || !hasStoreEntry(name) || !getMeta(name)) return;
            if (!isValidSyncMessage(msg)) {
                reportStoreError(name, `Sync message for "${name}" is malformed; ignoring.`);
                return;
            }
            const incomingVersion = resolveProtocolVersion(msg);
            if (incomingVersion !== SYNC_PROTOCOL_VERSION) {
                reportStoreError(name, `Sync protocol mismatch for "${name}". Expected v${SYNC_PROTOCOL_VERSION} but received ${String(incomingVersion ?? "unknown")}. Ignoring message.`);
                return;
            }
            const isSyncState = msg.type === "sync-state";
            if (isSyncState && (typeof msg.data === "undefined" || typeof msg.clock !== "number")) {
                reportStoreError(name, `Sync message for "${name}" is malformed; ignoring.`);
                return;
            }
            if (typeof syncOption === "object" && typeof syncOption.verify === "function") {
                let verified = false;
                try {
                    verified = !!syncOption.verify(msg as SyncMessage);
                } catch (err) {
                    reportStoreError(
                        name,
                        `Sync message verification failed for "${name}": ${(err as { message?: string })?.message ?? err}`
                    );
                    return;
                }
                if (!verified) {
                    reportStoreError(name, `Sync message for "${name}" failed verification; ignoring.`);
                    return;
                }
            }
            if (msg.type === "sync-request") {
                broadcastSync(name);
                return;
            }
            const resolver = typeof syncOption === "object" ? syncOption.conflictResolver : null;
            const order = compareSyncOrder({
                incoming: {
                    clock: msg.clock,
                    source: msg.source,
                },
                accepted: getAcceptedSyncVersion(name),
            });
            if (order <= 0) {
                const localUpdated = resolveMetaUpdatedAtMs(getMeta(name));
                const incomingUpdated = msg.updatedAt;
                if (resolver) {
                    const resolved = resolver({
                        local: getStoreValue(name),
                        incoming: msg.data,
                        localUpdated,
                        incomingUpdated,
                    });
                    if (resolved !== undefined) {
                        const normalizedResolved = normalizeIncomingState(name, resolved);
                        if (normalizedResolved === null) return;
                        setStoreValue(name, normalizedResolved);
                        const resolveUpdatedAt = typeof syncOption === "object" ? syncOption.resolveUpdatedAt : null;
                        const resolvedUpdatedAt = resolveUpdatedAt
                            ? resolveUpdatedAt({ localUpdated, incomingUpdated, now: Date.now() })
                            : Math.max(Date.now(), localUpdated, incomingUpdated);
                        resolveSyncVersion(name, resolvedUpdatedAt, typeof msg.clock === "number" ? msg.clock : 0);
                        notify(name);
                        broadcastSync(name);
                    }
                }
                return;
            }
            const normalizedIncoming = normalizeIncomingState(name, msg.data);
            if (normalizedIncoming === null) return;
            setStoreValue(name, normalizedIncoming);
            acceptIncomingSyncVersion(
                name,
                typeof msg.updatedAt === "number" ? msg.updatedAt : Date.now(),
                typeof msg.clock === "number" ? msg.clock : 0,
                typeof msg.source === "string" ? msg.source : ""
            );
            notify(name);
        };

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            syncWindowCleanup[name]?.();
            const hostWindow = window;
            const requestLatest = () => {
                requestSyncSnapshot({
                    name,
                    syncChannels,
                    instanceId,
                    reportStoreError,
                });
            };
            hostWindow.addEventListener("focus", requestLatest);
            hostWindow.addEventListener("online", requestLatest);
            syncWindowCleanup[name] = () => {
                hostWindow.removeEventListener("focus", requestLatest);
                hostWindow.removeEventListener("online", requestLatest);
            };
        }

        queueMicrotask(() => {
            requestSyncSnapshot({
                name,
                syncChannels,
                instanceId,
                reportStoreError,
            });
        });
    } catch (e) {
        warn(`Failed to setup sync for "${name}": ${(e as { message?: string })?.message || e}`);
    }
};

export const broadcastSync = ({
    name,
    syncOption,
    syncChannels,
    syncClocks,
    instanceId,
    updatedAt,
    data,
    hashState,
    reportStoreError,
}: {
    name: string;
    syncOption?: boolean | SyncOptions;
    syncChannels: SyncChannels;
    syncClocks: SyncClocks;
    instanceId: string;
    updatedAt: string | number;
    data: StoreValue;
    hashState: (value: unknown) => number;
    reportStoreError: (name: string, message: string) => void;
}): void => {
    const channel = syncChannels[name];
    if (!channel) return;
    try {
        const checksumMode = typeof syncOption === "object" && syncOption.checksum === "none" ? "none" : "hash";
        const payload: SyncMessage = {
            v: SYNC_PROTOCOL_VERSION,
            protocol: SYNC_PROTOCOL_VERSION,
            type: "sync-state",
            source: instanceId,
            name,
            clock: syncClocks[name] ?? 0,
            updatedAt: resolveUpdatedAtMs({ value: updatedAt, fallbackMs: Date.now() }),
            data,
            checksum: checksumMode === "hash" ? hashState(data) : null,
        };
        if (typeof syncOption === "object" && typeof syncOption.sign === "function") {
            try {
                const auth = syncOption.sign(payload);
                if (auth && typeof (auth as { then?: unknown }).then === "function") {
                    reportStoreError(
                        name,
                        `Sync signer for "${name}" returned a Promise. "sign" must be synchronous.`
                    );
                    return;
                }
                if (auth !== undefined) payload.auth = auth;
            } catch (err) {
                reportStoreError(
                    name,
                    `Failed to sign sync payload for "${name}": ${(err as { message?: string })?.message ?? err}`
                );
                return;
            }
        }
        const maxPayloadBytes = typeof syncOption === "object" && typeof syncOption.maxPayloadBytes === "number"
            ? syncOption.maxPayloadBytes
            : 64 * 1024;
        const payloadSize = byteLength(JSON.stringify(payload));

        if (payloadSize > maxPayloadBytes) {
            reportStoreError(
                name,
                `Sync payload for "${name}" exceeds ${maxPayloadBytes} bytes (${payloadSize} bytes). Skipping BroadcastChannel sync.`
            );
            return;
        }

        channel.postMessage(payload);
    } catch (err) {
        reportStoreError(name, `Failed to broadcast sync for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
};

export const createSyncFeatureRuntime = (): StoreFeatureRuntime => {
    const syncChannels: SyncChannels = Object.create(null);
    const syncClocks: SyncClocks = Object.create(null);
    const syncVersions: SyncVersions = Object.create(null);
    const syncWindowCleanup: SyncWindowCleanup = Object.create(null);
    const instanceId = `stroid_${Math.random().toString(16).slice(2)}`;

    const recordLocalVersion = (name: string, updatedAt: string | number): void => {
        syncVersions[name] = {
            clock: syncClocks[name] ?? 0,
            updatedAt: resolveUpdatedAtMs({ value: updatedAt, fallbackMs: Date.now() }),
            source: instanceId,
        };
    };

    const ensureLocalClock = (name: string, updatedAt: string | number): void => {
        bumpSyncClock(name, syncClocks);
        recordLocalVersion(name, updatedAt);
    };

    return {
        onStoreCreate(ctx) {
            if (!ctx.options.sync) return;

            setupSync({
                name: ctx.name,
                syncOption: ctx.options.sync,
                syncChannels,
                syncClocks,
                syncVersions,
                syncWindowCleanup,
                instanceId,
                getMeta: ctx.getMeta,
                getAcceptedSyncVersion: (name) => syncVersions[name],
                getStoreValue: (name) => ctx.getStoreValue(),
                hasStoreEntry: () => ctx.hasStore(),
                notify: () => ctx.notify(),
                validate: (name, next) => ctx.validate(next),
                reportStoreError: (name, message) => ctx.reportStoreError(message),
                warn: ctx.warn,
                setStoreValue: (name, value) => ctx.setStoreValue(value),
                normalizeIncomingState: (name, value) => {
                    const normalized = normalizeFeatureState({
                        value,
                        sanitize: ctx.sanitize,
                        validate: ctx.validate,
                        onSanitizeError: (err) => {
                            ctx.reportStoreError(
                                `Sanitize failed for incoming sync "${name}": ${(err as { message?: string })?.message ?? err}`
                            );
                        },
                    });
                    if (!normalized.ok) return null;
                    return normalized.value;
                },
                acceptIncomingSyncVersion: (name, updatedAtMs, incomingClock, source) => {
                    ctx.applyFeatureState(ctx.getStoreValue(), updatedAtMs);
                    syncClocks[ctx.name] = Math.max(syncClocks[ctx.name] ?? 0, incomingClock);
                    syncVersions[ctx.name] = {
                        clock: incomingClock,
                        updatedAt: updatedAtMs,
                        source,
                    };
                },
                resolveSyncVersion: (name, updatedAtMs, incomingClock) => {
                    ctx.applyFeatureState(ctx.getStoreValue(), updatedAtMs);
                    const resolvedClock = absorbSyncClock(ctx.name, incomingClock, syncClocks);
                    syncVersions[ctx.name] = {
                        clock: resolvedClock,
                        updatedAt: updatedAtMs,
                        source: instanceId,
                    };
                    return resolvedClock;
                },
                broadcastSync: () => {
                    const meta = ctx.getMeta();
                    if (!meta) return;
                    broadcastSync({
                        name: ctx.name,
                        syncOption: ctx.options.sync,
                        syncChannels,
                        syncClocks,
                        instanceId,
                        updatedAt: meta.updatedAtMs ?? meta.updatedAt,
                        data: ctx.getStoreValue(),
                        hashState: ctx.hashState,
                        reportStoreError: (name, message) => ctx.reportStoreError(message),
                    });
                },
            });

            if (syncChannels[ctx.name]) {
                const meta = ctx.getMeta();
                recordLocalVersion(ctx.name, meta?.updatedAtMs ?? meta?.updatedAt ?? new Date().toISOString());
            }
        },

        onStoreWrite(ctx) {
            if (!ctx.options.sync) return;
            const meta = ctx.getMeta();
            if (!meta) return;
            ensureLocalClock(ctx.name, meta.updatedAtMs ?? meta.updatedAt);
            broadcastSync({
                name: ctx.name,
                syncOption: ctx.options.sync,
                syncChannels,
                syncClocks,
                instanceId,
                updatedAt: meta.updatedAtMs ?? meta.updatedAt,
                data: ctx.next,
                hashState: ctx.hashState,
                reportStoreError: (name, message) => ctx.reportStoreError(message),
            });
        },

        beforeStoreDelete(ctx) {
            closeSyncResources({
                name: ctx.name,
                syncChannels,
                syncWindowCleanup,
                syncClocks,
                syncVersions,
            });
        },

        resetAll() {
            cleanupAllSyncResources({
                syncChannels,
                syncWindowCleanup,
            });
            Object.keys(syncChannels).forEach((key) => delete syncChannels[key]);
            Object.keys(syncClocks).forEach((key) => delete syncClocks[key]);
            Object.keys(syncVersions).forEach((key) => delete syncVersions[key]);
            Object.keys(syncWindowCleanup).forEach((key) => delete syncWindowCleanup[key]);
        },
    };
};

export const registerSyncFeature = (): void => {
    if (_registered) return;
    _registered = true;
    registerStoreFeature("sync", createSyncFeatureRuntime);
};
