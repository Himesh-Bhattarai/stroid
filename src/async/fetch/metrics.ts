/**
 * @module async/fetch/metrics
 *
 * LAYER: Module
 * OWNS:  Async fetch metrics readers.
 */
import { getAsyncMetrics as getAsyncMetricsRegistry, getAsyncMetricsByStore, type AsyncMetricsSnapshot } from "../cache.js";

export function getAsyncMetrics(): AsyncMetricsSnapshot;
export function getAsyncMetrics(name: string): AsyncMetricsSnapshot | null;
export function getAsyncMetrics(name?: string): AsyncMetricsSnapshot | null {
    if (!name) return { ...getAsyncMetricsRegistry() };
    const metrics = getAsyncMetricsByStore().get(name);
    return metrics ? { ...metrics } : null;
}
