/**
 * @module notification/metrics
 *
 * LAYER: Notification pipeline
 * OWNS:  Notify timing and metric aggregation.
 *
 * Consumers: notification/delivery.ts
 */
import type { FeatureMetrics, StoreFeatureMeta } from "../features/feature-registry.js";

const createDefaultMetrics = (): FeatureMetrics => ({
    notifyCount: 0,
    totalNotifyMs: 0,
    lastNotifyMs: 0,
    resetCount: 0,
    totalResetMs: 0,
    lastResetMs: 0,
});

export const createMetrics = (metrics?: FeatureMetrics): FeatureMetrics =>
    metrics ?? createDefaultMetrics();

export const recordMetrics = (metrics: FeatureMetrics, elapsedMs: number): FeatureMetrics => {
    metrics.notifyCount += 1;
    metrics.totalNotifyMs += elapsedMs;
    metrics.lastNotifyMs = elapsedMs;
    return metrics;
};

export const commitMetrics = (metaEntry: StoreFeatureMeta | undefined, metrics: FeatureMetrics): void => {
    if (!metaEntry) return;
    if (metaEntry.metrics !== metrics) {
        metaEntry.metrics = metrics;
    }
};
