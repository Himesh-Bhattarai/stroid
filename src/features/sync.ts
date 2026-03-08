import type { StoreValue, SyncOptions } from "../adapters/options.js";

export type SyncChannels = Record<string, BroadcastChannel>;
export type SyncClocks = Record<string, number>;
export type SyncVersion = { clock: number; updatedAt: number; source: string };
export type SyncVersions = Record<string, SyncVersion>;
export type SyncWindowCleanup = Record<string, () => void>;

type SyncMeta = {
    updatedAt: string;
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
    incoming: { clock?: number; updatedAt?: number; source?: string };
    accepted?: SyncVersion;
}): number => {
    const localClock = accepted?.clock ?? 0;
    const incomingClock = typeof incoming.clock === "number" ? incoming.clock : 0;
    if (incomingClock !== localClock) return incomingClock - localClock;

    const localUpdated = accepted?.updatedAt ?? 0;
    const incomingUpdated = typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
    if (incomingUpdated !== localUpdated) return incomingUpdated - localUpdated;

    const incomingSource = incoming.source ?? "";
    const localSource = accepted?.source ?? "";
    return incomingSource.localeCompare(localSource);
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
            type: "sync-request",
            source: instanceId,
            name,
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
    validateSchema,
    reportStoreError,
    warn,
    setStoreValue,
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
    validateSchema: (name: string, next: StoreValue) => { ok: boolean };
    reportStoreError: (name: string, message: string) => void;
    warn: (message: string) => void;
    setStoreValue: (name: string, value: StoreValue) => void;
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
            if (msg.type === "sync-request") {
                broadcastSync(name);
                return;
            }
            const resolver = typeof syncOption === "object" ? syncOption.conflictResolver : null;
            const order = compareSyncOrder({
                incoming: {
                    clock: msg.clock,
                    updatedAt: msg.updatedAt,
                    source: msg.source,
                },
                accepted: getAcceptedSyncVersion(name),
            });
            if (order <= 0) {
                const localUpdated = new Date(getMeta(name)?.updatedAt || 0).getTime();
                const incomingUpdated = msg.updatedAt;
                if (resolver) {
                    const resolved = resolver({
                        local: getStoreValue(name),
                        incoming: msg.data,
                        localUpdated,
                        incomingUpdated,
                    });
                    if (resolved !== undefined) {
                        const schemaRes = validateSchema(name, resolved);
                        if (!schemaRes.ok) return;
                        setStoreValue(name, resolved);
                        const resolvedUpdatedAt = Math.max(Date.now(), localUpdated, incomingUpdated);
                        resolveSyncVersion(name, resolvedUpdatedAt, typeof msg.clock === "number" ? msg.clock : 0);
                        notify(name);
                        broadcastSync(name);
                    }
                }
                return;
            }
            const schemaRes = validateSchema(name, msg.data);
            if (!schemaRes.ok) return;
            setStoreValue(name, msg.data);
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
    updatedAt: string;
    data: StoreValue;
    hashState: (value: unknown) => number;
    reportStoreError: (name: string, message: string) => void;
}): void => {
    const channel = syncChannels[name];
    if (!channel) return;
    try {
        const payload = {
            type: "sync-state",
            source: instanceId,
            name,
            clock: syncClocks[name] ?? 0,
            updatedAt: Date.parse(updatedAt || new Date().toISOString()),
            data,
            checksum: hashState(data),
        };
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
