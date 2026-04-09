/**
 * Shared benchmark helpers.
 *
 * WHAT: Collects latency percentiles, ops/sec, and heap deltas for deterministic benchmark runs.
 * WHY: Raw loop timing is noisy; percentile and memory tracking expose tail-latency regressions.
 */
import { performance } from "node:perf_hooks";

export type BenchmarkSummary = {
    name: string;
    iterations: number;
    opsPerSec: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    totalMs: number;
    memoryDeltaBytes: number;
};

export type BenchCase = {
    name: string;
    iterations: number;
    warmupIterations?: number;
    beforeEach?: () => void | Promise<void>;
    run: (iteration: number) => void | Promise<void>;
};

const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
};

const maybeGc = (): void => {
    if (typeof global.gc === "function") {
        global.gc();
    }
};

export const runCase = async (benchCase: BenchCase): Promise<BenchmarkSummary> => {
    const warmup = benchCase.warmupIterations ?? Math.min(250, Math.max(25, Math.floor(benchCase.iterations * 0.01)));
    for (let i = 0; i < warmup; i += 1) {
        await benchCase.beforeEach?.();
        await benchCase.run(i);
    }

    maybeGc();
    const beforeHeap = process.memoryUsage().heapUsed;
    const durations: number[] = new Array(benchCase.iterations);
    const started = performance.now();

    for (let i = 0; i < benchCase.iterations; i += 1) {
        await benchCase.beforeEach?.();
        const startOne = performance.now();
        await benchCase.run(i);
        durations[i] = performance.now() - startOne;
    }

    const totalMs = performance.now() - started;
    maybeGc();
    const afterHeap = process.memoryUsage().heapUsed;

    const sorted = [...durations].sort((a, b) => a - b);
    return {
        name: benchCase.name,
        iterations: benchCase.iterations,
        totalMs,
        opsPerSec: benchCase.iterations / (totalMs / 1000),
        p50Ms: percentile(sorted, 0.50),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        memoryDeltaBytes: afterHeap - beforeHeap,
    };
};

export const formatSummary = (summary: BenchmarkSummary): string =>
    `${summary.name}: `
    + `ops/sec=${summary.opsPerSec.toFixed(2)}, `
    + `p50=${summary.p50Ms.toFixed(4)}ms, `
    + `p95=${summary.p95Ms.toFixed(4)}ms, `
    + `p99=${summary.p99Ms.toFixed(4)}ms, `
    + `memDelta=${summary.memoryDeltaBytes}B`;

