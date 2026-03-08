import type { StoreValue, SyncOptions } from "../adapters/options.js";

export type SyncChannels = Record<string, BroadcastChannel>;
export type SyncClocks = Record<string, number>;
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
    name,
    incoming,
    syncClocks,
    getMeta,
    instanceId,
}: {
    name: string;
    incoming: { clock?: number; updatedAt?: number; source?: string };
    syncClocks: SyncClocks;
    getMeta: (name: string) => SyncMeta | undefined;
    instanceId: string;
}): number => {
    const localClock = syncClocks[name] ?? 0;
    const incomingClock = typeof incoming.clock === "number" ? incoming.clock : 0;
    if (incomingClock !== localClock) return incomingClock - localClock;

    const localUpdated = new Date(getMeta(name)?.updatedAt || 0).getTime();
    const incomingUpdated = typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
    if (incomingUpdated !== localUpdated) return incomingUpdated - localUpdated;

    const incomingSource = incoming.source ?? "";
    return incomingSource.localeCompare(instanceId);
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
}: {
    name: string;
    syncChannels: SyncChannels;
    syncWindowCleanup: SyncWindowCleanup;
    syncClocks: SyncClocks;
}): void => {
    syncChannels[name]?.close();
    delete syncChannels[name];
    syncWindowCleanup[name]?.();
    delete syncWindowCleanup[name];
    delete syncClocks[name];
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
    syncWindowCleanup,
    instanceId,
    getMeta,
    getStoreValue,
    hasStoreEntry,
    notify,
    validateSchema,
    reportStoreError,
    warn,
    setStoreValue,
    updateMetaAfterSync,
    broadcastSync,
}: {
    name: string;
    syncOption?: boolean | SyncOptions;
    syncChannels: SyncChannels;
    syncClocks: SyncClocks;
    syncWindowCleanup: SyncWindowCleanup;
    instanceId: string;
    getMeta: (name: string) => SyncMeta | undefined;
    getStoreValue: (name: string) => StoreValue;
    hasStoreEntry: (name: string) => boolean;
    notify: (name: string) => void;
    validateSchema: (name: string, next: StoreValue) => { ok: boolean };
    reportStoreError: (name: string, message: string) => void;
    warn: (message: string) => void;
    setStoreValue: (name: string, value: StoreValue) => void;
    updateMetaAfterSync: (name: string, updatedAtMs: number, incomingClock: number) => void;
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
                name,
                incoming: {
                    clock: msg.clock,
                    updatedAt: msg.updatedAt,
                    source: msg.source,
                },
                syncClocks,
                getMeta,
                instanceId,
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
                        updateMetaAfterSync(name, Math.max(localUpdated, incomingUpdated), typeof msg.clock === "number" ? msg.clock : 0);
                        notify(name);
                    }
                }
                return;
            }
            const schemaRes = validateSchema(name, msg.data);
            if (!schemaRes.ok) return;
            setStoreValue(name, msg.data);
            updateMetaAfterSync(name, msg.updatedAt, typeof msg.clock === "number" ? msg.clock : 0);
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
