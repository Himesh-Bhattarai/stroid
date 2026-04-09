/**
 * @module features/sync/channel
 *
 * LAYER: Feature runtime
 * OWNS:  BroadcastChannel message flow for sync feature.
 */
import type { StoreValue, SyncMessage, SyncOptions } from "../../adapters/options.js";
import { runFeatureWriteHooksExcept } from "../../core/store-lifecycle/hooks.js";
import { isDev, warnAlways } from "../../utils.js";
import { resolveUpdatedAtMs } from "../state-helpers.js";
import {
    byteLength,
    compareSyncOrder,
    isValidSyncMessage,
    resolveLoopGuardMs,
    resolveMetaUpdatedAtMs,
    resolveProtocolVersion,
    SYNC_PROTOCOL_VERSION,
} from "./helpers.js";
import type { SyncChannels, SyncClocks, SyncMeta, SyncVersion, SyncVersions, SyncWindowCleanup } from "./types.js";

const insecureSyncWarned = new Set<string>();
const signerVerifyWarned = new Set<string>();

export const resetSyncWarningState = (): void => {
    insecureSyncWarned.clear();
    signerVerifyWarned.clear();
};

const requestSyncSnapshot = ({
    name,
    syncChannels,
    instanceId,
    authToken,
    reportStoreError,
}: {
    name: string;
    syncChannels: SyncChannels;
    instanceId: string;
    authToken?: string;
    reportStoreError: (name: string, message: string) => void;
}): void => {
    const channel = syncChannels[name];
    if (!channel) return;
    try {
        const payload: SyncMessage = {
            v: SYNC_PROTOCOL_VERSION,
            protocol: SYNC_PROTOCOL_VERSION,
            type: "sync-request",
            source: instanceId,
            name,
            clock: 0,
            requestedAt: Date.now(),
        };
        if (authToken) payload.token = authToken;
        channel.postMessage(payload);
    } catch (err) {
        reportStoreError(name, `Failed to request sync snapshot for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
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
    applyIncomingState,
    normalizeIncomingState,
    acceptIncomingSyncVersion,
    resolveSyncVersion,
    broadcastSync,
    markLoopGuard,
    hashState,
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
    applyIncomingState: (name: string, value: StoreValue, updatedAtMs: number) => StoreValue;
    normalizeIncomingState: (name: string, value: StoreValue) => StoreValue | null;
    acceptIncomingSyncVersion: (name: string, updatedAtMs: number, incomingClock: number, source: string) => void;
    resolveSyncVersion: (name: string, updatedAtMs: number, incomingClock: number) => number;
    broadcastSync: (name: string) => void;
    markLoopGuard: (name: string, windowMs: number) => void;
    hashState: (value: unknown) => number;
}): void => {
    if (!syncOption) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
        reportStoreError(name, `Sync enabled for "${name}" but BroadcastChannel not available in this environment.`);
        return;
    }
    const policy = typeof syncOption === "object" ? syncOption.policy : undefined;
    const allowInsecure = policy === "insecure"
        || (policy !== "strict" && typeof syncOption === "object" && syncOption.insecure === true);
    const hasAuthToken = typeof syncOption === "object"
        && typeof syncOption.authToken === "string"
        && syncOption.authToken.length > 0;
    const hasVerify = typeof syncOption === "object" && typeof syncOption.verify === "function";
    const hasSign = typeof syncOption === "object" && typeof syncOption.sign === "function";

    const strictPolicy = policy === "strict" || (!isDev() && policy !== "insecure");
    if (strictPolicy && !allowInsecure && !hasAuthToken && !hasVerify) {
        reportStoreError(
            name,
            `Sync for "${name}" requires authToken or verify in strict mode. ` +
            `Use sync: { policy: "insecure" } to acknowledge the risk.`
        );
        return;
    }

    if (!strictPolicy && !allowInsecure && !hasAuthToken && !hasVerify && !insecureSyncWarned.has(name)) {
        insecureSyncWarned.add(name);
        warnAlways(
            `Sync for "${name}" is unauthenticated. Any same-origin tab can forge sync messages. ` +
            `Provide sync.authToken or sync.verify to enforce authentication.`
        );
    }

    if (hasSign && !hasVerify && !signerVerifyWarned.has(name)) {
        signerVerifyWarned.add(name);
        warn(
            `Sync for "${name}" is configured with "sign" but no "verify". ` +
            `"sign" has no effect unless incoming messages are verified.`
        );
    }
    const expectedToken = typeof syncOption === "object" ? syncOption.authToken : undefined;
    const loopGuardMs = resolveLoopGuardMs(syncOption);
    let tokenWarned = false;
    const channelName = typeof syncOption === "object" && syncOption.channel
        ? syncOption.channel
        : `stroid_sync_${name}`;
    try {
        const channel = new BroadcastChannel(channelName);
        syncChannels[name] = channel;
        channel.onmessage = (event: MessageEvent) => {
            const raw: unknown = event.data;
            if (!raw || typeof raw !== "object") return;

            const maybe = raw as Record<string, unknown>;
            if (maybe.source === instanceId) return;
            if (maybe.name !== name) return;
            if (syncChannels[name] !== channel || !hasStoreEntry(name) || !getMeta(name)) return;

            if (!isValidSyncMessage(raw)) {
                reportStoreError(name, `Sync message for "${name}" is malformed; ignoring.`);
                return;
            }
            const msg = raw;
            if (expectedToken && msg.token !== expectedToken) {
                if (!tokenWarned) {
                    reportStoreError(name, `Sync message for "${name}" failed auth token verification; ignoring.`);
                    tokenWarned = true;
                }
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
            const checksumMode = typeof syncOption === "object" && syncOption.checksum === "none" ? "none" : "hash";
            if (isSyncState && checksumMode !== "none") {
                const expectedChecksum = hashState(msg.data);
                if (msg.checksum !== expectedChecksum) {
                    reportStoreError(
                        name,
                        `Sync checksum mismatch for "${name}". ` +
                        `Expected ${String(expectedChecksum)}, got ${String(msg.checksum)}. Ignoring message.`
                    );
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
                const incomingUpdated = typeof msg.updatedAt === "number" ? msg.updatedAt : Date.now();
                if (resolver) {
                    let resolved: StoreValue | void;
                    try {
                        resolved = resolver({
                            local: getStoreValue(name),
                            incoming: msg.data,
                            localUpdated,
                            incomingUpdated,
                        });
                    } catch (err) {
                        reportStoreError(
                            name,
                            `Sync conflictResolver for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                        );
                        return;
                    }
                    if (resolved !== undefined) {
                        const normalizedResolved = normalizeIncomingState(name, resolved);
                        if (normalizedResolved === null) return;
                        const prev = getStoreValue(name);
                        const resolveUpdatedAt = typeof syncOption === "object" ? syncOption.resolveUpdatedAt : null;
                        let resolvedUpdatedAt = Math.max(Date.now(), localUpdated, incomingUpdated);
                        if (resolveUpdatedAt) {
                            try {
                                resolvedUpdatedAt = resolveUpdatedAt({
                                    localUpdated,
                                    incomingUpdated,
                                    now: Date.now(),
                                });
                            } catch (err) {
                                reportStoreError(
                                    name,
                                    `Sync resolveUpdatedAt for "${name}" failed: ${(err as { message?: string })?.message ?? err}`,
                                );
                                return;
                            }
                        }
                        const appliedValue = applyIncomingState(name, normalizedResolved, resolvedUpdatedAt);
                        resolveSyncVersion(name, resolvedUpdatedAt, typeof msg.clock === "number" ? msg.clock : 0);
                        runFeatureWriteHooksExcept(name, "sync", prev, appliedValue, () => notify(name), ["sync"]);
                        if (loopGuardMs) markLoopGuard(name, loopGuardMs);
                        notify(name);
                        broadcastSync(name);
                    }
                }
                return;
            }
            const normalizedIncoming = normalizeIncomingState(name, msg.data);
            if (normalizedIncoming === null) return;
            const prev = getStoreValue(name);
            const appliedValue = applyIncomingState(
                name,
                normalizedIncoming,
                typeof msg.updatedAt === "number" ? msg.updatedAt : Date.now()
            );
            acceptIncomingSyncVersion(
                name,
                typeof msg.updatedAt === "number" ? msg.updatedAt : Date.now(),
                typeof msg.clock === "number" ? msg.clock : 0,
                typeof msg.source === "string" ? msg.source : ""
            );
            runFeatureWriteHooksExcept(name, "sync", prev, appliedValue, () => notify(name), ["sync"]);
            if (loopGuardMs) markLoopGuard(name, loopGuardMs);
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
                    authToken: expectedToken,
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
                authToken: expectedToken,
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
        if (typeof syncOption === "object" && syncOption.authToken) {
            payload.token = syncOption.authToken;
        }
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

        try {
            channel.postMessage(payload);
        } catch (err) {
            if (err && typeof err === "object" && (err as { name?: string }).name === "DataCloneError") {
                reportStoreError(
                    name,
                    `Sync payload for "${name}" could not be cloned (DataCloneError). ` +
                    `Remove non-serializable values or provide a custom serializer. ` +
                    `Payload size ~${payloadSize} bytes.`
                );
                return;
            }
            throw err;
        }
    } catch (err) {
        reportStoreError(name, `Failed to broadcast sync for "${name}": ${(err as { message?: string })?.message ?? err}`);
    }
};
