/**
 * @module features/sync/runtime
 *
 * LAYER: Feature runtime
 * OWNS:  Sync feature runtime integration with store lifecycle.
 */
import { registerStoreFeature, type StoreFeatureRuntime } from "../feature-registry.js";
import { normalizeFeatureState, resolveUpdatedAtMs } from "../state-helpers.js";
import { broadcastSync, resetSyncWarningState, setupSync } from "./channel.js";
import { resolveLoopGuardMs } from "./helpers.js";
import { absorbSyncClock, bumpSyncClock, cleanupAllSyncResources, closeSyncResources } from "./resources.js";
import type { SyncChannels, SyncClocks, SyncVersions, SyncWindowCleanup } from "./types.js";

let _registered = false;

export const createSyncFeatureRuntime = (): StoreFeatureRuntime => {
    const syncChannels: SyncChannels = Object.create(null);
    const syncClocks: SyncClocks = Object.create(null);
    const syncVersions: SyncVersions = Object.create(null);
    const syncWindowCleanup: SyncWindowCleanup = Object.create(null);
    const loopGuardUntil: Record<string, number> = Object.create(null);
    const loopGuardWarned = new Set<string>();
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

    const markLoopGuard = (name: string, windowMs: number): void => {
        if (!windowMs || !Number.isFinite(windowMs)) return;
        loopGuardUntil[name] = Date.now() + windowMs;
    };

    const shouldSuppressBroadcast = (name: string, windowMs: number | null): boolean => {
        if (!windowMs) return false;
        const until = loopGuardUntil[name];
        if (!until) return false;
        if (Date.now() >= until) {
            delete loopGuardUntil[name];
            return false;
        }
        return true;
    };

    return {
        onStoreCreate(ctx) {
            if (!ctx.options.sync) return;
            const syncOption = ctx.options.sync;
            const emitStoreNotify = ctx.notify;
            const policy = typeof syncOption === "object" ? syncOption.policy : undefined;
            const allowInsecure = policy === "insecure"
                || (policy !== "strict" && typeof syncOption === "object" && syncOption.insecure === true);
            const hasAuthToken = typeof syncOption === "object"
                && typeof syncOption.authToken === "string"
                && syncOption.authToken.length > 0;
            const hasVerify = typeof syncOption === "object" && typeof syncOption.verify === "function";
            const strictPolicy = policy === "strict" || (!ctx.isDev() && policy !== "insecure");
            if (strictPolicy && syncOption && !allowInsecure && !hasAuthToken && !hasVerify) {
                ctx.reportStoreError(
                    `Sync for "${ctx.name}" requires authToken or verify in strict mode. ` +
                    `Use sync: { policy: "insecure" } to acknowledge the risk.`
                );
                ctx.options.sync = false;
                return;
            }

            setupSync({
                name: ctx.name,
                syncOption,
                syncChannels,
                syncClocks,
                syncVersions,
                syncWindowCleanup,
                instanceId,
                getMeta: ctx.getMeta,
                getAcceptedSyncVersion: (name) => syncVersions[name],
                getStoreValue: () => ctx.getStoreValue(),
                hasStoreEntry: () => ctx.hasStore(),
                notify: () => emitStoreNotify(),
                validate: (name, next) => ctx.validate(next),
                reportStoreError: (name, message) => ctx.reportStoreError(message),
                warn: ctx.warn,
                applyIncomingState: (name, value, updatedAtMs) =>
                    ctx.applyFeatureState(value, updatedAtMs, {
                        source: "sync",
                        validate: ctx.validate,
                    }),
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
                    syncClocks[ctx.name] = Math.max(syncClocks[ctx.name] ?? 0, incomingClock);
                    syncVersions[ctx.name] = {
                        clock: incomingClock,
                        updatedAt: updatedAtMs,
                        source,
                    };
                },
                resolveSyncVersion: (name, updatedAtMs, incomingClock) => {
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
                markLoopGuard,
                hashState: ctx.hashState,
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
            const loopGuardMs = resolveLoopGuardMs(ctx.options.sync);
            if (shouldSuppressBroadcast(ctx.name, loopGuardMs)) {
                ensureLocalClock(ctx.name, meta.updatedAtMs ?? meta.updatedAt);
                if (!loopGuardWarned.has(ctx.name)) {
                    loopGuardWarned.add(ctx.name);
                    ctx.warn(
                        `Sync broadcast for "${ctx.name}" suppressed by loopGuard to prevent feedback loops.`
                    );
                }
                return;
            }
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
            delete loopGuardUntil[ctx.name];
            loopGuardWarned.delete(ctx.name);
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
            Object.keys(loopGuardUntil).forEach((key) => delete loopGuardUntil[key]);
            resetSyncWarningState();
            loopGuardWarned.clear();
        },
    };
};

export const registerSyncFeature = (): void => {
    if (_registered) return;
    _registered = true;
    registerStoreFeature("sync", createSyncFeatureRuntime);
};

export const installSync = (): void => {
    registerSyncFeature();
};
