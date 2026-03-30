import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SampleSummary = {
  count: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  totalMs: number;
};

export const round = (value: number): number => Number(value.toFixed(3));

export const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

export const flushRuntime = async (ticks = 4): Promise<void> => {
  for (let index = 0; index < ticks; index += 1) {
    await wait(0);
  }
};

export const maybeGc = (): void => {
  if (typeof global.gc === "function") {
    global.gc();
  }
};

export const heapMb = (): number =>
  process.memoryUsage().heapUsed / (1024 * 1024);

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const p95 = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
};

export const summarizeSamples = (values: number[]): SampleSummary => ({
  count: values.length,
  medianMs: round(median(values)),
  p95Ms: round(p95(values)),
  maxMs: round(values.length > 0 ? Math.max(...values) : 0),
  totalMs: round(values.reduce((sum, value) => sum + value, 0)),
});

export const measure = async <T>(fn: () => Promise<T> | T): Promise<{ durationMs: number; value: T }> => {
  const start = performance.now();
  const value = await fn();
  return {
    durationMs: round(performance.now() - start),
    value,
  };
};

export const emitReport = (report: unknown): void => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

export const isMainModule = (metaUrl: string): boolean => {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
};
