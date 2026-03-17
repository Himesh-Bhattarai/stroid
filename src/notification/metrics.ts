/**
 * @module notification/metrics
 *
 * LAYER: Notification pipeline
 * OWNS:  Notify timing and metric aggregation.
 *
 * Consumers: notification/delivery.ts
 */
import type { FeatureMetrics, StoreFeatureMeta } from "../feature-registry.js";

export const createMetrics = (metrics?: FeatureMetrics): FeatureMetrics => ({
    notifyCount: metrics?.notifyCount ?? 0,
    totalNotifyMs: metrics?.totalNotifyMs ?? 0,
    lastNotifyMs: metrics?.lastNotifyMs ?? 0,
});

export const recordMetrics = (metrics: FeatureMetrics, elapsedMs: number): FeatureMetrics => {
    metrics.notifyCount += 1;
    metrics.totalNotifyMs += elapsedMs;
    metrics.lastNotifyMs = elapsedMs;
    return metrics;
};

export const commitMetrics = (metaEntry: StoreFeatureMeta | undefined, metrics: FeatureMetrics): void => {
    if (!metaEntry) return;
    metaEntry.metrics = metrics;
};
